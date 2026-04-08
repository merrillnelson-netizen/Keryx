/**
 * Keryx SMS Relay — content.js v1.0.6
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
 *  - Session timestamp guard allows a 30-second grace window so messages
 *    sent just before observer attach are still captured.
 */

'use strict';

// ── Deduplication ─────────────────────────────────────────────────────────────
// Key: "<contact>|<body>|<minuteBucket>"
// Stores the last 200 keys in chrome.storage.local with a 24h expiry.
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const DEDUP_KEY = 'keryx_seen_messages';
const DEDUP_MAX = 200;

// How far back the initial scan looks when navigating to a conversation.
// Captures messages that arrived while Lemur Browser was paused/in background.
const INITIAL_SCAN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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
 * Returns null if no specific contact can be identified (e.g. when the user
 * is viewing the conversation list, not an individual conversation).
 * Callers must handle null and skip relaying in that case.
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
  // Attempt to extract name from page title ("Name – Google Messages" format).
  // If the title is just "Messages" or empty after stripping, return null so
  // callers know we're not in a specific conversation.
  const title = document.title
    .replace(/google\s*messages/gi, '')
    .replace(/messages/gi, '')
    .replace(/[–—|]/g, '')
    .trim();
  return title || null;
}

/**
 * Returns true when the URL indicates the user has a specific conversation
 * open, as opposed to viewing the conversation list or home screen.
 *
 * Google Messages URL patterns:
 *   List view:              /web/u/0/conversations
 *   Specific conversation:  /web/u/0/conversations/<threadId>
 *   (also handles /web/conversations/<threadId> without /u/N/ prefix)
 *
 * We require at least one non-empty path segment after /conversations/.
 */
function isViewingConversation() {
  return /\/conversations\/[^/\s]+/.test(location.pathname);
}

/**
 * Extract the thread ID from the current URL path.
 * Returns the segment after /conversations/ or null if not present.
 * Used as a fallback contact address when the DOM header can't be read.
 */
function getThreadIdFromUrl() {
  const m = location.pathname.match(/\/conversations\/([^/?#\s]+)/);
  return m ? m[1] : null;
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
    // Angular custom elements (current Google Messages 2024-2025)
    '.text-msg-content',
    '.ng-star-inserted .text-msg-content',
    'mws-text-message-part .msg-content',
    'mws-text-message-part',
    // Structural data attributes (stable across DOM refactors)
    '[data-message-item]',
    '[data-e2e-message-text]',
    '[jsmodel] [dir="auto"]',
    // Older class-based selectors
    '.text-msg',
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
 * Try to parse a UTC timestamp (ms) from a message bubble node.
 * Google Messages uses several DOM patterns depending on version:
 *  - <time datetime="ISO-string"> inside or adjacent to the bubble
 *  - data-time or data-timestamp attributes
 *  - aria-label like "Received January 15 at 3:30 PM"
 *
 * Returns a millisecond timestamp (number) if parseable, null otherwise.
 * Looks at the candidate and up to 8 ancestor levels to find the time element.
 */
function extractMessageTimestamp(node) {
  // Helper: try parsing a string as a date, return ms or null
  function tryParse(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // Gather nodes to inspect: the candidate, its subtree, and ancestors
  const searchNodes = [];
  searchNodes.push(node);

  // Children
  const timeEls = node.querySelectorAll?.('time, [data-time], [data-timestamp], [datetime]') ?? [];
  for (const el of timeEls) searchNodes.push(el);

  // Walk up up to 8 ancestors looking for time context
  let ancestor = node.parentElement;
  for (let i = 0; i < 8 && ancestor; i++) {
    searchNodes.push(ancestor);
    const ancestorTimes = ancestor.querySelectorAll?.('time, [data-time], [data-timestamp], [datetime]') ?? [];
    for (const el of ancestorTimes) searchNodes.push(el);
    ancestor = ancestor.parentElement;
  }

  for (const el of searchNodes) {
    // Standard <time datetime="..."> ISO string
    const dt = el.getAttribute?.('datetime');
    const t1 = tryParse(dt);
    if (t1) return t1;

    // data-time / data-timestamp attributes (ms or ISO)
    const t2 = tryParse(el.getAttribute?.('data-time')) ?? tryParse(el.getAttribute?.('data-timestamp'));
    if (t2) return t2;

    // aria-label: "Received January 15 at 3:30 PM" — strip prefix and parse
    const label = el.getAttribute?.('aria-label') || '';
    if (label) {
      const stripped = label.replace(/^(sent|received)[,:]?\s*/i, '');
      const t3 = tryParse(stripped);
      if (t3) return t3;
    }
  }

  return null;
}

// ── Header-context timestamp helpers ─────────────────────────────────────────

/**
 * Convert a relative timestamp label from a Google Messages group-header
 * separator (e.g. "Today, 3:42 PM", "Yesterday, 3:42 PM", "Monday, 3:42 PM",
 * "Apr 7, 3:42 PM", "Apr 7, 2025, 3:42 PM") to a UTC millisecond timestamp.
 * Returns null if the string cannot be parsed.
 *
 * Format coverage:
 *   "3:42 PM"               → today at 3:42 PM local
 *   "Today, 3:42 PM"        → today at 3:42 PM local
 *   "Yesterday, 3:42 PM"    → yesterday at 3:42 PM local
 *   "Sunday, 3:42 PM"       → most recent Sunday at 3:42 PM local
 *   "Sun, 3:42 PM"          → most recent Sunday at 3:42 PM local
 *   "Apr 7, 3:42 PM"        → April 7 current year at 3:42 PM local
 *   "Apr 7, 2025, 3:42 PM"  → April 7, 2025 at 3:42 PM local
 */
function parseRelativeTime(text) {
  if (!text) return null;
  text = text.trim();

  // Direct parse first — handles ISO strings and other absolute formats
  const direct = new Date(text).getTime();
  if (!isNaN(direct) && direct > 946684800000 /* year 2000 */) return direct;

  const now = new Date();

  // Apply HH:MM AM/PM to a base Date, return ms or null
  function applyTime(base, timeStr) {
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const period = (m[3] || '').toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const d = new Date(base);
    d.setHours(h, min, 0, 0);
    const result = d.getTime();
    return isNaN(result) ? null : result;
  }

  // "Today, 3:42 PM" — or just "Today"
  if (/^today/i.test(text)) {
    const timeStr = text.replace(/^today[,\s]*/i, '').trim();
    return timeStr ? applyTime(now, timeStr) : (() => { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); })();
  }

  // "Yesterday, 3:42 PM"
  if (/^yesterday/i.test(text)) {
    const timeStr = text.replace(/^yesterday[,\s]*/i, '').trim();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return timeStr ? applyTime(yesterday, timeStr) : (() => { yesterday.setHours(0,0,0,0); return yesterday.getTime(); })();
  }

  // "Monday, 3:42 PM" or "Mon, 3:42 PM"
  const DAY_NAMES_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`^(${DAY_NAMES_FULL[i]}|${DAY_NAMES_SHORT[i]})[,\\s]+`, 'i');
    if (re.test(text)) {
      const timeStr = text.replace(re, '').trim();
      const target = new Date(now);
      const diff = ((now.getDay() - i) + 7) % 7 || 7; // at least 1 day back
      target.setDate(target.getDate() - diff);
      return timeStr ? applyTime(target, timeStr) : (() => { target.setHours(0,0,0,0); return target.getTime(); })();
    }
  }

  // "Apr 7, 3:42 PM" or "Apr 7, 2025, 3:42 PM"
  const mDate = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(?:(\d{4}),\s*)?(.+)$/);
  if (mDate) {
    const year = mDate[3] ? parseInt(mDate[3], 10) : now.getFullYear();
    const base = new Date(`${mDate[1]} ${mDate[2]}, ${year}`);
    if (!isNaN(base.getTime())) return applyTime(base, mDate[4]);
  }

  // Bare "3:42 PM" with no date prefix — use today
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text)) {
    return applyTime(now, text);
  }

  return null;
}

/**
 * Scan the conversation container in DOM order for timestamp separator elements
 * (the group headers Google Messages places between message clusters, e.g.
 * "Today, 3:42 PM", "Monday, 3:42 PM").
 *
 * Returns an array of { node, ms } pairs sorted in DOM order (ascending).
 * Only entries where the timestamp is parseable are included.
 */
function extractHeaderTimestamps(container) {
  const results = [];
  if (!container) return results;

  const seen = new WeakSet();

  function tryAdd(el) {
    if (!el || seen.has(el)) return;
    seen.add(el);

    // Prefer structured attribute (most reliable, no need to parse text)
    const attrVal =
      el.getAttribute?.('datetime') ||
      el.getAttribute?.('data-e2e-timestamp') ||
      el.getAttribute?.('data-timestamp') ||
      el.getAttribute?.('data-time');
    if (attrVal) {
      const ms = new Date(attrVal).getTime();
      if (!isNaN(ms) && ms > 0) { results.push({ node: el, ms }); return; }
    }

    // Fall back to element text — must look like a timestamp, not a message body
    const text = (el.innerText ?? el.textContent ?? '').trim();
    if (!text || text.length > 80) return;
    // Must contain HH:MM to be considered a timestamp label
    if (!/\d{1,2}:\d{2}/.test(text)) return;
    const ms = parseRelativeTime(text);
    if (ms !== null && !isNaN(ms) && ms > 946684800000) results.push({ node: el, ms });
  }

  // Structural selectors covering known Google Messages DOM patterns
  const candidates = container.querySelectorAll(
    'mws-conversation-timestamp, ' +
    'mws-relative-timestamp, ' +
    '[data-e2e-timestamp], ' +
    '[role="separator"], ' +
    '[role="note"], ' +
    '[class*="timestamp"], ' +
    '[class*="time-divider"], ' +
    '[class*="date-divider"], ' +
    '[class*="time_stamp"]'
  );
  for (const el of candidates) tryAdd(el);

  // Sort by DOM order so we can binary-search / linear-scan safely
  results.sort((a, b) => {
    const pos = a.node.compareDocumentPosition(b.node);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1; // b is after a → a first
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  return results;
}

/**
 * Find the nearest timestamp header that precedes messageNode in DOM order.
 * Returns the ms timestamp of the last header that appears before the message,
 * or null if no parseable header precedes it.
 */
function getContextTimestamp(messageNode, headers) {
  if (!headers.length) return null;
  let best = null;
  for (const { node, ms } of headers) {
    // DOCUMENT_POSITION_FOLLOWING means messageNode comes after node
    if (node.compareDocumentPosition(messageNode) & Node.DOCUMENT_POSITION_FOLLOWING) {
      best = ms;
    }
  }
  return best;
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
 * Timestamp (ms) when the current observer session started.
 * Used to skip messages that were already visible before we attached —
 * i.e. historical conversation content — so we only relay genuinely new ones.
 */
let sessionStartedAt = 0;

/** Grace window for the session timestamp guard (ms). Messages sent up to
 *  this many milliseconds before the observer attached are still relayed.
 *  Without a grace window, messages whose DOM <time> is slightly older than
 *  sessionStartedAt (i.e. sent just before the page/tab focused) are dropped.
 */
const SESSION_GRACE_MS = 30_000;

/**
 * Serialisation queue so that concurrent isDuplicate calls don't race.
 * Each entry is a zero-arg function that returns a Promise.
 * processNodes enqueues work; the runner drains it one item at a time.
 */
const dedupQueue = [];
let dedupRunning = false;

async function runDedupQueue() {
  if (dedupRunning) return;
  dedupRunning = true;
  while (dedupQueue.length > 0) {
    const fn = dedupQueue.shift();
    try { await fn(); } catch (e) { console.error('[Keryx] Dedup queue error:', e); }
  }
  dedupRunning = false;
}

/**
 * Walk added DOM nodes, find message bubbles, extract text, deduplicate,
 * and relay to background.js.
 *
 * Key invariants:
 *  - Only nodes added AFTER sessionStartedAt are relayed (no history dumps).
 *  - Dedup checks run sequentially to avoid read-before-write races in storage.
 */
function processNodes(nodes) {
  // ── Guard 1: only relay when a specific conversation is open ────────────
  // When the user is on the conversation list (not inside a conversation),
  // the observer fires for list-item mutations.  We must not relay those —
  // they have no meaningful contact header and end up in a single "unknown"
  // conversation in Keryx.
  if (!isViewingConversation()) {
    console.log('[Keryx] Skipping — not in a specific conversation (list view or home)');
    return;
  }

  // ── Guard 2: resolve contact address before processing any nodes ─────────
  // DESIGN: thread ID is the STABLE contact address (unique per conversation),
  // so Keryx always groups messages correctly even if the DOM name changes.
  // The human-readable DOM name is sent separately as "name" so it becomes the
  // conversation's contactName in Keryx (displayed as "Michael Nelson" rather
  // than "CgIEBISNZ7...").  DOM name falls back to thread ID only when we are
  // genuinely in a conversation URL that somehow has no thread ID segment.
  const domName = getContactName();
  const threadId = getThreadIdFromUrl();
  const address = threadId || domName; // thread ID preferred; DOM name as last resort
  if (!address) {
    console.log('[Keryx] Skipping — could not identify thread ID or contact name');
    return;
  }
  if (!domName) {
    console.log(`[Keryx] DOM header not found — using thread ID as address: "${address}"`);
  } else if (!threadId) {
    console.log(`[Keryx] No thread ID in URL — using DOM name as address: "${address}"`);
  }

  // Scan the container once for timestamp group-header elements so each
  // candidate can look up the nearest preceding header for its timestamp.
  const headerTimestamps = extractHeaderTimestamps(activeTarget || findConversationContainer());

  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const candidates = new Set();
    const tag = node.tagName?.toLowerCase() || '';

    // Direct match: node is a message bubble element.
    // IMPORTANT: do NOT use tag.includes('message') — it is too broad and
    // matches conversation list items (e.g. mws-conversation-list-item).
    // Only match known message-bubble custom elements and explicit data attrs.
    if (
      tag === 'mws-message-part' ||
      tag === 'mws-message' ||
      tag === 'mws-text-message-part' ||
      node.hasAttribute?.('data-message-id') ||
      node.hasAttribute?.('data-e2e-message-id') ||
      node.hasAttribute?.('data-message-item')
    ) {
      candidates.add(node);
    }

    // Children: explicit message-bubble element types and data attributes only.
    // role="listitem" is intentionally excluded — conversation list rows also
    // carry that role and would be incorrectly captured.
    // [jsmodel][data-node-index] is also excluded — too broad in practice and
    // fully covered by the known tag/data-attr selectors above.
    const childMatches = node.querySelectorAll?.(
      'mws-message-part, mws-message, mws-text-message-part, ' +
      '[data-message-id], [data-e2e-message-id], [data-message-item]'
    ) ?? [];
    for (const c of childMatches) candidates.add(c);

    for (const candidate of candidates) {
      const text = extractMessageText(candidate);
      if (!text) {
        // Log when extraction fails so the DOM structure is visible in DevTools.
        // Always log (even for empty nodes) so silent failures are never invisible.
        const hint = (candidate.innerText ?? candidate.textContent ?? '').trim().slice(0, 40);
        console.warn('[Keryx] Could not extract text — node:', candidate.tagName?.toLowerCase(), '| hint:', hint || '(empty)');
        continue;
      }

      // Per-bubble timestamp (usually null for Google Messages — it stores
      // timestamps on group-header separators, not individual bubbles).
      const msgTs = extractMessageTimestamp(candidate);

      // Context timestamp: nearest preceding group-header separator.
      // Used when per-bubble timestamp is unavailable.
      const ctxTs = msgTs ?? getContextTimestamp(candidate, headerTimestamps);

      // Session-start guard: if we can resolve a timestamp and it predates
      // observer attach by more than the grace window, this is a historical
      // message — skip it.  When neither source yields a timestamp (brand-new
      // message whose header hasn't rendered yet) ctxTs is null and we fall
      // through to Date.now(), which is the correct time for a just-sent msg.
      if (ctxTs !== null && ctxTs < sessionStartedAt - SESSION_GRACE_MS) {
        console.log(`[Keryx] Skipping pre-session message (ts=${new Date(ctxTs).toISOString()}, session=${new Date(sessionStartedAt).toISOString()}): "${text.slice(0, 40)}"`);
        continue;
      }

      const direction = isOutgoingMessage(candidate) ? 'sent' : 'received';
      // Use per-bubble → context header → now (in that precedence order)
      const ts = ctxTs ?? Date.now();

      // Enqueue serialised dedup+relay to prevent concurrent storage races.
      dedupQueue.push(async () => {
        try {
          const dup = await isDuplicate(address, text, ts);
          if (dup) {
            console.log(`[Keryx] Dedup skip (${direction}) from "${address}": "${text.slice(0, 40)}"`);
            return;
          }
          console.log(`[Keryx] Relaying ${direction} msg from "${address}"${domName ? ` (${domName})` : ''}: "${text.slice(0, 60)}"`);
          chrome.runtime.sendMessage(
            {
              type: 'relay_sms',
              address,
              ...(domName ? { name: domName } : {}),
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
        } catch (err) {
          console.error('[Keryx] Dedup error:', err);
        }
      });
    }
  }
  // Kick the queue runner (no-op if already running)
  runDedupQueue();
}

/**
 * Find the best DOM node to observe for incoming message mutations.
 * Prefers the narrowest container that holds conversation messages.
 */
function findConversationContainer() {
  const selectors = [
    // Angular custom elements — most specific (current Google Messages)
    'mws-messages-list',
    'mws-conversation-container',
    // data-testid attributes (stable across DOM refactors)
    '[data-testid="message-list"]',
    '[data-testid="conversation-container"]',
    // Class-based (may change across versions but common historically)
    '.message-list-content',
    '.conversation-container',
    // Semantic/structural — most stable, unlikely to change
    '[role="list"][aria-label]',
    'main [role="list"]',
    // Broad fallbacks
    'main',
    '#main-content',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  console.warn('[Keryx] Could not find conversation container — falling back to document.body. Google Messages DOM may have changed. Open DevTools to inspect the message list structure.');
  return document.body;
}

/**
 * One-time scan of currently-visible messages in the open conversation.
 * Runs after the observer attaches (with a short delay for DOM to settle).
 *
 * Purpose: capture messages that arrived while Lemur Browser was paused or
 * in the background — the MutationObserver only fires on NEW mutations, so
 * these would otherwise be missed until the next incoming message.
 *
 * Only relays messages whose timestamp is within INITIAL_SCAN_WINDOW_MS (5 min).
 * Older history is skipped to prevent accidental history dumps.
 * All candidates go through the normal dedup queue so no duplicates are created.
 */
function doInitialScan() {
  if (!isViewingConversation()) return;

  const domName = getContactName();
  const threadId = getThreadIdFromUrl();
  const address = threadId || domName;
  if (!address) return;

  const now = Date.now();
  const cutoff = now - INITIAL_SCAN_WINDOW_MS;
  const container = findConversationContainer();

  // Build header-context map once for the whole scan
  const headers = extractHeaderTimestamps(container);

  const candidates = container.querySelectorAll(
    'mws-message-part, mws-message, mws-text-message-part, ' +
    '[data-message-id], [data-e2e-message-id], [data-message-item]'
  );

  let found = 0;
  for (const candidate of candidates) {
    const text = extractMessageText(candidate);
    if (!text) continue;

    // Try per-bubble timestamp first, then nearest preceding group header.
    const msgTs = extractMessageTimestamp(candidate);
    const ctxTs = msgTs ?? getContextTimestamp(candidate, headers);

    // If neither source yields a timestamp, we cannot determine whether this
    // message is within the recent window — skip it to avoid history dumps.
    if (ctxTs === null) {
      console.log('[Keryx] Initial scan: skipping candidate — no timestamp (per-bubble or header context)');
      continue;
    }
    // Outside the 5-minute recency window — skip old history
    if (ctxTs < cutoff) continue;

    found++;
    const direction = isOutgoingMessage(candidate) ? 'sent' : 'received';
    const ts = ctxTs;

    dedupQueue.push(async () => {
      try {
        const dup = await isDuplicate(address, text, ts);
        if (dup) return;
        console.log(`[Keryx] Initial scan relaying ${direction} msg from "${address}"${domName ? ` (${domName})` : ''}: "${text.slice(0, 60)}"`);
        chrome.runtime.sendMessage({
          type: 'relay_sms',
          address,
          ...(domName ? { name: domName } : {}),
          body: text,
          direction,
          timestamp: new Date(ts).toISOString(),
        });
      } catch (err) {
        console.error('[Keryx] Initial scan relay error:', err);
      }
    });
  }

  if (found > 0) {
    console.log(`[Keryx] Initial scan queued ${found} recent message(s) for relay`);
  } else {
    console.log('[Keryx] Initial scan: no recent messages found');
  }

  // Drain the queue — without this call the items enqueued above would sit idle
  // until the next MutationObserver mutation triggers processNodes() → runDedupQueue().
  runDedupQueue();
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
  sessionStartedAt = Date.now();
  console.log('[Keryx] Observer attached to', targetEl.tagName?.toLowerCase() || 'body', '— watching for NEW messages only');

  // Run a one-time scan of currently-visible messages after a short delay so
  // the DOM has time to finish rendering the conversation thread.
  // This picks up messages that arrived while Lemur Browser was in the background.
  setTimeout(doInitialScan, 800);
}

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Track the last seen thread ID so we can detect conversation switches even
 * when Google Messages SPA reuses the same container element across navigations.
 */
let activeThreadId = null;

/**
 * Called whenever URL or DOM nav is detected. Handles two cases:
 * 1. Container node changed → re-attach MutationObserver (which also triggers doInitialScan).
 * 2. Container same but thread ID changed → container element reused for new conversation;
 *    call doInitialScan() directly so recent messages aren't missed without a full re-attach.
 */
function handleNavigation(reason) {
  const newContainer = findConversationContainer();
  const newThreadId = getThreadIdFromUrl();

  if (newContainer !== activeTarget) {
    console.log(`[Keryx] Navigation detected (${reason}) — switching observer target`);
    activeThreadId = newThreadId;
    attachObserver(newContainer); // attachObserver already calls setTimeout(doInitialScan, 800)
  } else if (newThreadId && newThreadId !== activeThreadId) {
    // Same DOM container, new thread — SPA reused the container element.
    // MutationObserver is already attached, but we still need a fresh initial scan.
    console.log(`[Keryx] Thread changed (${reason}): "${activeThreadId}" → "${newThreadId}" (container reused) — running initial scan`);
    activeThreadId = newThreadId;
    setTimeout(doInitialScan, 800);
  }
}

/**
 * Main entry point.
 * - Immediately tries to find and observe the conversation container.
 * - Installs a *separate* body-level observer that watches for SPA navigation
 *   so we can re-attach when the user switches conversations.
 */
function init() {
  console.log('[Keryx] Content script initialised on', location.href);

  // Capture starting thread ID
  activeThreadId = getThreadIdFromUrl();

  // Attach to whatever container exists right now
  attachObserver(findConversationContainer());

  // Watch for SPA navigation — two complementary mechanisms:

  // 1. MutationObserver on body (catches structural app-shell swaps)
  const navObserver = new MutationObserver(() => handleNavigation('DOM'));
  navObserver.observe(document.body, { childList: true, subtree: true });

  // 2. URL polling — Google Messages uses History.pushState for conversation
  //    switches, which mutates the URL without touching body's direct children.
  //    Poll every 1.5 s as a reliable safety net (querySelector is very cheap).
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      handleNavigation('URL');
    }
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
