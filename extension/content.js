/**
 * Keryx SMS Relay — content.js
 * Runs on https://messages.google.com/*
 *
 * Strategy:
 *  - Watch the conversation body with MutationObserver
 *  - When new message nodes appear, extract sender + body + timestamp
 *  - Hash the triple to deduplicate before sending to background.js
 *  - Background.js sends to the Keryx relay endpoint
 */

'use strict';

// ── Deduplication ─────────────────────────────────────────────────────────────
// Key: "<sender>|<body>|<minuteBucket>"
// We store the last 200 keys in chrome.storage.local, each with an expiry.
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEDUP_KEY = 'keryx_seen_messages';
const DEDUP_MAX = 200;

async function isDuplicate(sender, body, ts) {
  const bucket = Math.floor(ts / 60000); // round to minute
  const key = `${sender.trim()}|${body.trim()}|${bucket}`;
  const { [DEDUP_KEY]: seen = {} } = await chrome.storage.local.get(DEDUP_KEY);
  const now = Date.now();
  // prune expired
  for (const k of Object.keys(seen)) {
    if (now - seen[k] > DEDUP_TTL_MS) delete seen[k];
  }
  if (seen[key]) return true;
  // record and trim to max size
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
function getContactName() {
  // Google Messages shows the contact name / phone in the conversation header.
  // Try multiple selectors that have appeared over time.
  const selectors = [
    '[data-testid="conversation-header-name"]',
    'mws-conversation-header .title',
    '.conversation-title',
    'h2[data-e2e-conversation-name]',
    '.contact-name',
    'mws-contact-name',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  // Fall back to the page title which typically includes the contact name
  const title = document.title.replace('Messages', '').replace('–', '').trim();
  return title || 'unknown';
}

function extractMessageText(node) {
  // Text of a message bubble — try progressively broader selectors
  const selectors = [
    'mws-message-part .text-msg',
    'mws-message-part',
    '.message-text',
    '.bubble-text',
    '[dir="auto"]',
  ];
  for (const sel of selectors) {
    const el = node.matches?.(sel) ? node : node.querySelector?.(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return null;
}

function isOutgoingMessage(node) {
  // Outgoing (sent) messages typically have a class indicating "outgoing" or "sent"
  return node.classList?.contains('sent') ||
    node.hasAttribute?.('data-is-sending-user') ||
    !!node.closest?.('[data-is-sending-user]') ||
    node.classList?.contains('outgoing');
}

// ── Observer ──────────────────────────────────────────────────────────────────
let observerStarted = false;
let lastProcessedCount = 0;

function processNodes(nodes) {
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    // Direct message node or containing new message nodes
    const candidates = [];
    const directMatch =
      node.tagName?.toLowerCase().includes('message') ||
      node.classList?.contains('message') ||
      node.querySelector?.('mws-message-part');

    if (directMatch) candidates.push(node);
    // Also check children
    const children = node.querySelectorAll?.('mws-message-part, .message-list-item, [class*="message-row"]') ?? [];
    candidates.push(...children);

    for (const candidate of candidates) {
      const text = extractMessageText(candidate);
      if (!text || text.length < 1) continue;

      const direction = isOutgoingMessage(candidate) ? 'sent' : 'received';
      const contact = getContactName();
      const ts = Date.now();

      isDuplicate(contact, text, ts).then(dup => {
        if (dup) return;
        chrome.runtime.sendMessage({
          type: 'relay_sms',
          address: contact,
          body: text,
          direction,
          timestamp: new Date(ts).toISOString(),
        });
      });
    }
  }
}

function startObserver() {
  if (observerStarted) return;

  // Target the conversation body — try multiple possible containers
  const containerSelectors = [
    'mws-messages-list',
    '.message-list-content',
    '[data-testid="message-list"]',
    'main',
    '#main-content',
  ];

  let target = null;
  for (const sel of containerSelectors) {
    target = document.querySelector(sel);
    if (target) break;
  }
  if (!target) {
    // Last resort: observe the whole body but filter aggressively
    target = document.body;
  }

  const observer = new MutationObserver((mutations) => {
    const addedNodes = [];
    for (const m of mutations) {
      for (const n of m.addedNodes) addedNodes.push(n);
    }
    if (addedNodes.length > 0) processNodes(addedNodes);
  });

  observer.observe(target, { childList: true, subtree: true });
  observerStarted = true;
  console.log('[Keryx] MutationObserver attached to', target.tagName || 'body');

  // Also process already-visible messages on load (scroll-into-view)
  processNodes([target]);
}

// Google Messages is an SPA — wait for the conversation view to mount
function waitForConversation() {
  // Try immediately
  startObserver();
  // Also watch for SPA navigation
  const navObserver = new MutationObserver(() => {
    const container = document.querySelector('mws-messages-list, .message-list-content, [data-testid="message-list"]');
    if (container && !observerStarted) startObserver();
  });
  navObserver.observe(document.body, { childList: true, subtree: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForConversation);
} else {
  waitForConversation();
}
