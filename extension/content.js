/**
 * Keryx SMS Relay — content.js v1.0.8
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
 *  - Per-conversation "seen" tracking prevents full conversation dumps on
 *    every load — only genuinely new messages are relayed.
 */

'use strict';

// ── Deduplication ─────────────────────────────────────────────────────────────
// Key: "<contact>|<body>|<minuteBucket>"
// Stores the last 500 keys in chrome.storage.local with a 24h expiry.
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const DEDUP_KEY = 'keryx_seen_messages';
const DEDUP_MAX = 500;

// ── Per-thread "seen" tracking ────────────────────────────────────────────────
// Tracks which threads have had an initial "mark-only" scan so subsequent
// scans only relay NEW messages (not the whole visible conversation history).
// Key: 'keryx_seen_threads' → { [threadId]: timestampMs }
const SEEN_THREADS_KEY = 'keryx_seen_threads';

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

/**
 * Returns true if this thread has already had its initial mark-only scan.
 * On first encounter of a thread, we mark all visible messages as seen
 * without relaying so we don't dump the whole conversation history.
 */
async function isThreadSeen(threadId) {
  const { [SEEN_THREADS_KEY]: seen = {} } = await chrome.storage.local.get(SEEN_THREADS_KEY);
  return !!seen[threadId];
}

/** Record that we have completed the initial mark-only scan for this thread. */
async function markThreadSeen(threadId) {
  const { [SEEN_THREADS_KEY]: seen = {} } = await chrome.storage.local.get(SEEN_THREADS_KEY);
  seen[threadId] = Date.now();
  await chrome.storage.local.set({ [SEEN_THREADS_KEY]: seen });
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

  // ── Relative patterns (checked BEFORE direct parse to avoid JS mis-parsing) ──

  // "Today, 3:42 PM" or just "Today"
  if (/^today/i.test(text)) {
    const timeStr = text.replace(/^today[,\s]*/i, '').trim();
    return timeStr ? applyTime(now, timeStr) : (() => { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); })();
  }

  // "Yesterday, 3:42 PM" or just "Yesterday"
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
  // IMPORTANT: handle BEFORE the direct-parse fallback — new Date("Apr 7, 3:42 PM")
  // resolves to an incorrect year (2001) in some JS engines.
  const mDate = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(?:(\d{4}),\s*)?(.+)$/);
  if (mDate) {
    // If an explicit 4-digit year is present use it; otherwise force current year.
    const year = mDate[3] ? parseInt(mDate[3], 10) : now.getFullYear();
    const base = new Date(`${mDate[1]} ${mDate[2]}, ${year}`);
    if (!isNaN(base.getTime())) return applyTime(base, mDate[4]);
  }

  // Bare "3:42 PM" with no date prefix — use today
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text)) {
    return applyTime(now, text);
  }

  // ── Absolute fallback: ISO strings / RFC-2822 / full date strings ─────────
  // Only reached for strings that matched none of the relative patterns above.
  // Validate the year is plausible (post-2000) to catch mis-parses.
  const direct = new Date(text).getTime();
  if (!isNaN(direct) && direct > 946684800000 /* 2000-01-01 */) return direct;

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
 * Sort an array of DOM nodes by their document order (ascending).
 * Nodes earlier in the DOM come first.
 */
function sortByDomOrder(nodes) {
  return nodes.slice().sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1; // b comes after a → a first
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

/**
 * Walk added DOM nodes, find message bubbles, extract text, deduplicate,
 * and relay to background.js.
 *
 * Key invariants:
 *  - Only nodes added AFTER sessionStartedAt are relayed (no history dumps).
 *  - Dedup checks run sequentially to avoid read-before-write races in storage.
 *  - DOM-order tiebreaker: messages in the same cluster get distinct timestamps
 *    (base + N×1000 ms) so Keryx can sort them correctly even when the header
 *    covers the whole cluster with a single minute-level time.
 */
function processNodes(nodes) {
  // ── Guard 1: only relay when a specific conversation is open ────────────
  if (!isViewingConversation()) {
    console.log('[Keryx] Skipping — not in a specific conversation (list view or home)');
    return;
  }

  // ── Guard 2: resolve contact address before processing any nodes ─────────
  const domName = getContactName();
  const threadId = getThreadIdFromUrl();
  const address = threadId || domName;
  if (!address) {
    console.log('[Keryx] Skipping — could not identify thread ID or contact name');
    return;
  }
  if (!domName) {
    console.log(`[Keryx] DOM header not found — using thread ID as address: "${address}"`);
  } else if (!threadId) {
    console.log(`[Keryx] No thread ID in URL — using DOM name as address: "${address}"`);
  }

  // Scan the container once for timestamp group-header elements
  const headerTimestamps = extractHeaderTimestamps(activeTarget || findConversationContainer());

  // Collect and sort candidates by DOM order for consistent tiebreaking
  const candidates = new Set();
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = node.tagName?.toLowerCase() || '';
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

    const childMatches = node.querySelectorAll?.(
      'mws-message-part, mws-message, mws-text-message-part, ' +
      '[data-message-id], [data-e2e-message-id], [data-message-item]'
    ) ?? [];
    for (const c of childMatches) candidates.add(c);
  }

  // Sort by DOM order so timestamp tiebreaker is deterministic
  const sortedCandidates = sortByDomOrder(Array.from(candidates));

  // ── DOM-order timestamp tiebreaker state ─────────────────────────────────
  // Google Messages groups messages under a single cluster header. Every
  // message in the cluster gets the same ctxTs from that header. We add
  // N×1000 ms per message (by DOM position) so Keryx can sort them correctly.
  let lastClusterTs = null;
  let clusterOffset = 0;

  for (const candidate of sortedCandidates) {
    const text = extractMessageText(candidate);
    if (!text) {
      const hint = (candidate.innerText ?? candidate.textContent ?? '').trim().slice(0, 40);
      console.warn('[Keryx] Could not extract text — node:', candidate.tagName?.toLowerCase(), '| hint:', hint || '(empty)');
      continue;
    }

    const msgTs = extractMessageTimestamp(candidate);
    const ctxTs = msgTs ?? getContextTimestamp(candidate, headerTimestamps);

    // Session-start guard: skip pre-session historical messages.
    // When ctxTs is null (brand-new message, header not yet rendered) we fall
    // through to Date.now() which is the correct time for a just-sent message.
    if (ctxTs !== null && ctxTs < sessionStartedAt - SESSION_GRACE_MS) {
      console.log(`[Keryx] Skipping pre-session message (ts=${new Date(ctxTs).toISOString()}, session=${new Date(sessionStartedAt).toISOString()}): "${text.slice(0, 40)}"`);
      continue;
    }

    // Apply DOM-order tiebreaker within the same cluster
    const baseTs = ctxTs ?? Date.now();
    if (baseTs === lastClusterTs) {
      clusterOffset++;
    } else {
      lastClusterTs = baseTs;
      clusterOffset = 0;
    }
    const finalTs = baseTs + clusterOffset * 1000;

    const direction = isOutgoingMessage(candidate) ? 'sent' : 'received';

    dedupQueue.push(async () => {
      try {
        const dup = await isDuplicate(address, text, finalTs);
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
            timestamp: new Date(finalTs).toISOString(),
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

  // Kick the queue runner (no-op if already running)
  runDedupQueue();
}

/**
 * Find the best DOM node to observe for incoming message mutations.
 * Prefers the narrowest container that holds conversation messages.
 */
function findConversationContainer() {
  const selectors = [
    'mws-messages-list',
    'mws-conversation-container',
    '[data-testid="message-list"]',
    '[data-testid="conversation-container"]',
    '.message-list-content',
    '.conversation-container',
    '[role="list"][aria-label]',
    'main [role="list"]',
    'main',
    '#main-content',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  console.warn('[Keryx] Could not find conversation container — falling back to document.body.');
  return document.body;
}

/**
 * One-time scan of currently-visible messages in the open conversation.
 *
 * Behaviour depends on whether this thread has been scanned before:
 *
 *  FIRST LOAD (thread not in keryx_seen_threads):
 *    Mark all visible messages in the dedup cache WITHOUT relaying them.
 *    This prevents the full conversation history from dumping into Keryx.
 *    Records the thread as "seen" so subsequent scans use relay mode.
 *
 *  SUBSEQUENT LOADS (thread already in keryx_seen_threads):
 *    Relay any message not already in the dedup cache — i.e. messages that
 *    arrived since the last time this conversation was active.
 *
 * In both modes, a DOM-order tiebreaker adds N×1000 ms to messages that share
 * the same cluster-header timestamp so Keryx can sort them correctly.
 */
async function doInitialScan() {
  if (!isViewingConversation()) return;

  const domName = getContactName();
  const threadId = getThreadIdFromUrl();
  const address = threadId || domName;
  if (!address || !threadId) return;

  const container = findConversationContainer();
  const headers = extractHeaderTimestamps(container);

  const rawCandidates = container.querySelectorAll(
    'mws-message-part, mws-message, mws-text-message-part, ' +
    '[data-message-id], [data-e2e-message-id], [data-message-item]'
  );

  // Sort by DOM order for consistent tiebreaker
  const candidates = sortByDomOrder(Array.from(rawCandidates));

  // Check whether this is the first time we've scanned this thread
  const firstLoad = !(await isThreadSeen(threadId));

  if (firstLoad) {
    console.log(`[Keryx] Initial scan (MARK-ONLY): first encounter of thread "${threadId}" — marking ${candidates.length} visible message(s) as seen without relaying`);
  } else {
    console.log(`[Keryx] Initial scan (RELAY mode): checking ${candidates.length} visible message(s) for new arrivals`);
  }

  // DOM-order tiebreaker state
  let lastClusterTs = null;
  let clusterOffset = 0;
  let found = 0;

  for (const candidate of candidates) {
    const text = extractMessageText(candidate);
    if (!text) continue;

    const msgTs = extractMessageTimestamp(candidate);
    const ctxTs = msgTs ?? getContextTimestamp(candidate, headers);

    // Skip messages with no resolvable timestamp — we can't dedup or order them
    if (ctxTs === null) {
      console.log('[Keryx] Initial scan: skipping candidate — no timestamp (per-bubble or header context)');
      continue;
    }

    // Apply DOM-order tiebreaker within the same cluster
    if (ctxTs === lastClusterTs) {
      clusterOffset++;
    } else {
      lastClusterTs = ctxTs;
      clusterOffset = 0;
    }
    const finalTs = ctxTs + clusterOffset * 1000;

    if (firstLoad) {
      // MARK-ONLY: register in dedup cache without relaying
      dedupQueue.push(async () => {
        try {
          await isDuplicate(address, text, finalTs); // side effect: registers key in cache
        } catch (err) {
          console.error('[Keryx] Mark-only dedup error:', err);
        }
      });
    } else {
      // RELAY MODE: send new messages to Keryx
      found++;
      const direction = isOutgoingMessage(candidate) ? 'sent' : 'received';

      dedupQueue.push(async () => {
        try {
          const dup = await isDuplicate(address, text, finalTs);
          if (dup) return;
          console.log(`[Keryx] Initial scan relaying ${direction} msg from "${address}"${domName ? ` (${domName})` : ''}: "${text.slice(0, 60)}"`);
          chrome.runtime.sendMessage({
            type: 'relay_sms',
            address,
            ...(domName ? { name: domName } : {}),
            body: text,
            direction,
            timestamp: new Date(finalTs).toISOString(),
          });
        } catch (err) {
          console.error('[Keryx] Initial scan relay error:', err);
        }
      });
    }
  }

  if (firstLoad) {
    // After marking all visible messages, record this thread as seen
    // so the NEXT scan uses relay mode
    dedupQueue.push(async () => {
      await markThreadSeen(threadId);
      console.log(`[Keryx] Thread "${threadId}" marked as seen — future scans will relay new messages`);
    });
  } else if (found > 0) {
    console.log(`[Keryx] Initial scan queued ${found} message(s) for relay`);
  } else {
    console.log('[Keryx] Initial scan: no new messages found');
  }

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

  // Run a one-time scan after a short delay so the DOM finishes rendering.
  setTimeout(doInitialScan, 800);
}

// ── Initialisation ────────────────────────────────────────────────────────────

/** Track the last seen thread ID to detect conversation switches. */
let activeThreadId = null;

/**
 * Called whenever URL or DOM nav is detected. Handles two cases:
 * 1. Container node changed → re-attach MutationObserver (also triggers doInitialScan).
 * 2. Container same but thread ID changed → SPA reused container;
 *    call doInitialScan() directly so recent messages aren't missed.
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
    console.log(`[Keryx] Thread changed (${reason}): "${activeThreadId}" → "${newThreadId}" (container reused) — running initial scan`);
    activeThreadId = newThreadId;
    setTimeout(doInitialScan, 800);
  }
}

/**
 * Handle messages from the background service worker.
 *  - background_scan: service worker alarm triggered a periodic check;
 *    run doInitialScan() to pick up any messages that arrived while the
 *    content script was suspended in a background tab.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'background_scan') {
    console.log('[Keryx] Background scan triggered by service worker alarm');
    // doInitialScan enqueues async work and returns synchronously
    doInitialScan();
    sendResponse({ ok: true });
  }
  // Return false (sync response already sent above) — do NOT return true
  // unless we need to send an async response, to avoid keeping the channel open.
});

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
