/**
 * Keryx SMS Relay — content.js
 * Runs on https://messages.google.com/*
 *
 * Strategy:
 *  - Watch the conversation body with MutationObserver
 *  - When new message nodes appear, extract sender + body
 *  - Hash the pair to deduplicate before sending to background.js
 *  - Background.js POSTs to the Keryx relay endpoint
 *
 * Robustness notes:
 *  - Uses a broad layered selector strategy since Google Messages changes
 *    its DOM class names frequently between releases.
 *  - Tracks the currently-observed element so SPA navigation between
 *    conversations cleanly re-attaches the observer to the new container.
 *  - All key steps log [Keryx] prefixed messages to the DevTools console.
 */

'use strict';

// ── Deduplication ─────────────────────────────────────────────────────────────
// Key: "<contact>|<body>|<minuteBucket>"
// Stores the last 200 keys in chrome.storage.local with a 24h expiry.
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const DEDUP_KEY = 'keryx_seen_messages';
const DEDUP_MAX = 200;

async function isDuplicate(sender, body, ts) {
  const bucket = Math.floor(ts / 60000);
  const key = `${sender.trim()}|${body.trim()}|${bucket}`;
  const { [DEDUP_KEY]: seen = {} } = await chrome.storage.local.get(DEDUP_KEY);
  const now = Date.now();
  for (const k of Object.keys(seen)) {
    if (now - seen[k] > DEDUP_TTL_MS) delete seen[k];
  }
  if (seen[key]) return true;
  seen[key] = now;
  const keys = Object.keys(seen);
  if (keys.length > DEDUP_MAX) {
    const oldest = keys.sort((a, b) => seen[a] - seen[b]).slice(0, keys.length - DEDUP_MAX);
    for (const k of oldest) delete seen[k];
  }
  await chrome.storage.local.set({ [DEDUP_KEY]: seen });
  return false;
}

// ── DOM Helpers ───────────────────────────────────────────────────────────────

/**
 * Get the name/number of the currently-open conversation from the header.
 * Tries multiple selectors that have appeared across Google Messages versions.
 */
function getContactName() {
  const selectors = [
    // Angular component selectors (current)
    'mws-conversation-header [data-e2e-contact-name]',
    'mws-conversation-header .contact-name',
    'mws-conversation-title .main-title',
    'mws-conversation-header .title',
    // data-testid attributes
    '[data-testid="conversation-header-name"]',
    '[data-testid="contact-name"]',
    // Older class-based selectors
    '.conversation-title',
    '.conversation-name',
    'h2[data-e2e-conversation-name]',
    '.contact-name',
    'mws-contact-name',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  // Fall back: page title usually reads "Name – Messages" or "Messages | Name"
  const title = document.title
    .replace(/messages/gi, '')
    .replace(/[–—|]/g, '')
    .trim();
  return title || 'unknown';
}

/**
 * Extract the visible text of a message bubble.
 *
 * Google Messages' Angular app uses custom elements (mws-message-part) that
 * wrap the actual text in varying child elements depending on the version and
 * message type (SMS, RCS, MMS).  We try known specific selectors first, then
 * fall back to innerText of the whole bubble (which excludes hidden nodes and
 * respects the rendered layout, unlike textContent).
 */
function extractMessageText(node) {
  // ── Layer 1: known text-content child selectors ──────────────────────────
  const childSelectors = [
    // Current Google Messages (2024-2025 RCS/SMS)
    '.text-msg-content',
    '.ng-star-inserted .text-msg-content',
    'mws-text-message-part .msg-content',
    'mws-text-message-part',
    // Older/fallback selectors
    '.text-msg',
    '[data-e2e-message-text]',
    '.msg-content',
    '.message-text-content',
    '.message-text',
    '.bubble-text',
    // dir="auto" is consistently applied to localizable text in Google apps
    '[dir="auto"]',
  ];

  for (const sel of childSelectors) {
    // Check the node itself, then look inside it
    const el = node.matches?.(sel) ? node : node.querySelector?.(sel);
    if (!el) continue;
    const text = (el.innerText ?? el.textContent ?? '').trim();
    if (text.length > 0) return text;
  }

  // ── Layer 2: the bubble element's own innerText ───────────────────────────
  // innerText respects CSS visibility so it avoids hidden metadata.
  // Skip nodes that are themselves the big list container.
  const tag = node.tagName?.toLowerCase() || '';
  if (
    tag === 'mws-message-part' ||
    tag === 'mws-message' ||
    tag === 'mws-text-message-part' ||
    node.hasAttribute?.('data-message-id') ||
    node.hasAttribute?.('data-e2e-message-id')
  ) {
    const text = (node.innerText ?? node.textContent ?? '').trim();
    // Sanity: require at least 1 char, reject strings that are only whitespace
    // or look like bare timestamps (e.g. "3:42 PM")
    if (text.length > 0 && !/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(text)) {
      return text;
    }
  }

  return null;
}

/**
 * Determine whether a message was sent (outgoing) vs received (incoming).
 * Checks a range of attributes and classes used across Google Messages versions.
 */
function isOutgoingMessage(node) {
  // Walk up a few levels to check containers too
  const check = (el) =>
    el?.classList?.contains('sent') ||
    el?.classList?.contains('outgoing') ||
    el?.hasAttribute?.('data-is-sending-user') ||
    el?.getAttribute?.('data-e2e-is-outgoing') === 'true' ||
    el?.hasAttribute?.('data-e2e-outgoing');

  if (check(node)) return true;

  // Check immediate ancestors (message wrappers sit above mws-message-part)
  let ancestor = node.parentElement;
  for (let i = 0; i < 5 && ancestor; i++) {
    if (check(ancestor)) return true;
    ancestor = ancestor.parentElement;
  }

  return false;
}

// ── Observer lifecycle ────────────────────────────────────────────────────────

/** The MutationObserver instance currently active. */
let activeObserver = null;
/** The DOM node the active observer is attached to. */
let activeTarget = null;

/**
 * Walk added DOM nodes, find message bubbles, extract text, deduplicate,
 * and relay to background.js.
 */
function processNodes(nodes) {
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const candidates = new Set();
    const tag = node.tagName?.toLowerCase() || '';

    // Direct match: node is a message bubble or message row
    if (
      tag === 'mws-message-part' ||
      tag === 'mws-message' ||
      tag === 'mws-text-message-part' ||
      tag.includes('message') ||
      node.hasAttribute?.('data-message-id') ||
      node.hasAttribute?.('data-e2e-message-id')
    ) {
      candidates.add(node);
    }

    // Children: cast a wide net — custom elements plus data attributes
    const childMatches = node.querySelectorAll?.(
      'mws-message-part, mws-message, mws-text-message-part, ' +
      '[data-message-id], [data-e2e-message-id]'
    ) ?? [];
    for (const c of childMatches) candidates.add(c);

    for (const candidate of candidates) {
      const text = extractMessageText(candidate);
      if (!text) continue;

      const direction = isOutgoingMessage(candidate) ? 'sent' : 'received';
      const contact = getContactName();
      const ts = Date.now();

      isDuplicate(contact, text, ts)
        .then(dup => {
          if (dup) {
            console.log(`[Keryx] Dedup skip (${direction}) from "${contact}": "${text.slice(0, 40)}"`);
            return;
          }
          console.log(`[Keryx] Relaying ${direction} msg from "${contact}": "${text.slice(0, 60)}"`);
          chrome.runtime.sendMessage(
            {
              type: 'relay_sms',
              address: contact,
              body: text,
              direction,
              timestamp: new Date(ts).toISOString(),
            },
            (resp) => {
              if (chrome.runtime.lastError) {
                console.warn('[Keryx] sendMessage error:', chrome.runtime.lastError.message);
              } else if (resp?.ok) {
                console.log('[Keryx] Relay OK — routed_to:', resp.data?.routed_to);
              } else {
                console.warn('[Keryx] Relay failed:', resp?.error);
              }
            }
          );
        })
        .catch(err => console.error('[Keryx] Dedup error:', err));
    }
  }
}

/**
 * Find the best DOM node to observe for incoming message mutations.
 * Prefers the narrowest container that holds conversation messages.
 */
function findConversationContainer() {
  const selectors = [
    'mws-messages-list',
    '[data-testid="message-list"]',
    '.message-list-content',
    'mws-conversation-container',
    '.conversation-container',
    'main',
    '#main-content',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return document.body;
}

/**
 * Attach (or re-attach) a MutationObserver to `targetEl`.
 * If we're already watching a *different* element, disconnect first.
 */
function attachObserver(targetEl) {
  if (activeTarget === targetEl) return; // already watching this element

  if (activeObserver) {
    activeObserver.disconnect();
    console.log('[Keryx] Observer disconnected from', activeTarget?.tagName?.toLowerCase());
  }

  const observer = new MutationObserver((mutations) => {
    const added = [];
    for (const m of mutations) {
      for (const n of m.addedNodes) added.push(n);
    }
    if (added.length > 0) processNodes(added);
  });

  observer.observe(targetEl, { childList: true, subtree: true });
  activeObserver = observer;
  activeTarget = targetEl;
  console.log('[Keryx] Observer attached to', targetEl.tagName?.toLowerCase() || 'body');

  // Process already-visible messages in the newly-opened conversation
  processNodes([targetEl]);
}

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Main entry point.
 * - Immediately tries to find and observe the conversation container.
 * - Installs a *separate* body-level observer that watches for SPA navigation
 *   so we can re-attach when the user switches conversations.
 */
function init() {
  console.log('[Keryx] Content script initialised on', location.href);

  // Attach to whatever container exists right now
  attachObserver(findConversationContainer());

  // Watch for SPA navigation — two complementary mechanisms:

  // 1. MutationObserver on body (catches structural app-shell swaps)
  const navObserver = new MutationObserver(() => {
    const newContainer = findConversationContainer();
    if (newContainer !== activeTarget) {
      console.log('[Keryx] Navigation detected (DOM) — switching observer target');
      attachObserver(newContainer);
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: false });

  // 2. URL polling — Google Messages uses History.pushState for conversation
  //    switches, which mutates the URL without touching body's direct children.
  //    Poll every 1.5 s as a reliable safety net (querySelector is very cheap).
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      const newContainer = findConversationContainer();
      if (newContainer !== activeTarget) {
        console.log('[Keryx] Navigation detected (URL) — switching observer target');
        attachObserver(newContainer);
      }
    }
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
