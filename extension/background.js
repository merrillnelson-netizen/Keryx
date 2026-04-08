/**
 * Keryx SMS Relay — background.js (Service Worker, MV3)
 *
 * Responsibilities:
 *  - Receive relay_sms messages from content.js
 *  - POST them to /api/relay/inbound using the stored API key + endpoint
 *  - Track connection status (last 200 OK timestamp) in chrome.storage.local
 *  - Provide status to popup.js via chrome.runtime.onMessage
 *  - Periodically ping the Google Messages tab so content.js can scan for
 *    new messages even while Lemur Browser is in the background
 */

'use strict';

const STATUS_KEY = 'keryx_relay_status'; // { lastOk, lastError, errorMsg }
const CONFIG_KEY = 'keryx_config';       // { apiKey, endpoint }

// ── Background alarm: periodic scan of Google Messages tab ───────────────────

const BG_ALARM_NAME = 'keryx_bg_scan';
const BG_ALARM_PERIOD_MIN = 2; // every 2 minutes

/**
 * Create the periodic scan alarm if it doesn't already exist.
 * Safe to call multiple times — won't create duplicates.
 */
function setupAlarm() {
  chrome.alarms.get(BG_ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(BG_ALARM_NAME, { periodInMinutes: BG_ALARM_PERIOD_MIN });
      console.log(`[Keryx] Background scan alarm created (every ${BG_ALARM_PERIOD_MIN} min)`);
    }
  });
}

// Set up alarm on install, browser start, and immediately on service worker launch
chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
setupAlarm();

/**
 * Send a background_scan message to every open Google Messages tab.
 * content.js handles the message by running doInitialScan() to pick up
 * any messages that arrived while the content script was throttled/suspended.
 */
async function triggerBackgroundScan() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: 'https://messages.google.com/*' });
  } catch (err) {
    console.log('[Keryx] Background scan: tabs.query failed —', err.message);
    return;
  }

  if (!tabs.length) {
    console.log('[Keryx] Background scan: no Google Messages tab found');
    return;
  }

  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'background_scan' }, (resp) => {
      if (chrome.runtime.lastError) {
        // Tab may be discarded or content script not yet injected — safe to ignore
        console.log(
          `[Keryx] Background scan: content script not ready in tab ${tab.id} —`,
          chrome.runtime.lastError.message
        );
      } else {
        console.log(`[Keryx] Background scan triggered in tab ${tab.id}`, resp ?? '');
      }
    });
  }
}

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BG_ALARM_NAME) {
    triggerBackgroundScan();
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'relay_sms') {
    handleRelaySms(message).then(sendResponse).catch(err => {
      console.error('[Keryx] handleRelaySms unhandled error:', err?.message);
      sendResponse({ ok: false, error: err?.message });
    });
    return true; // keep channel open for async response
  }

  if (message.type === 'get_status') {
    chrome.storage.local.get([STATUS_KEY, CONFIG_KEY]).then(result => {
      sendResponse({
        status: result[STATUS_KEY] ?? null,
        config: result[CONFIG_KEY]
          ? { hasKey: !!result[CONFIG_KEY].apiKey, endpoint: result[CONFIG_KEY].endpoint }
          : null,
      });
    });
    return true;
  }

  if (message.type === 'save_config') {
    const { apiKey, endpoint } = message;
    chrome.storage.local.set({
      [CONFIG_KEY]: { apiKey: apiKey.trim(), endpoint: endpoint.trim() },
    }).then(() => {
      console.log('[Keryx] Config saved — endpoint:', endpoint.trim());
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'test_ping') {
    testConnection().then(sendResponse).catch(err => {
      console.error('[Keryx] test_ping error:', err?.message);
      sendResponse({ ok: false, error: err?.message });
    });
    return true;
  }
});

// ── Core relay function ───────────────────────────────────────────────────────
async function handleRelaySms({ address, body, direction, timestamp, name }) {
  const { [CONFIG_KEY]: config } = await chrome.storage.local.get(CONFIG_KEY);

  if (!config?.apiKey || !config?.endpoint) {
    console.error('[Keryx] Not configured — open the popup and save your API key + endpoint.');
    throw new Error('Keryx not configured. Open the extension popup and save your API key.');
  }

  const payload = {
    type: 'sms',
    source: 'chrome_extension',
    address,
    body,
    direction: direction ?? 'received',
    timestamp,
    ...(name ? { name } : {}),
  };

  console.log(
    `[Keryx] POST relay SMS → ${config.endpoint}`,
    `| address: "${address}"${name ? ` (${name})` : ''} | dir: ${direction ?? 'received'} | body: "${(body ?? '').slice(0, 60)}"`
  );

  let response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    const msg = `Network error: ${networkErr.message}`;
    console.error('[Keryx] Relay network error:', networkErr.message);
    await chrome.storage.local.set({
      [STATUS_KEY]: { lastOk: null, lastError: Date.now(), errorMsg: msg },
    });
    throw new Error(msg);
  }

  const now = Date.now();
  if (response.ok) {
    const data = await response.json().catch(() => ({}));
    console.log('[Keryx] Relay success — HTTP', response.status, '| routed_to:', data?.routed_to);
    await chrome.storage.local.set({
      [STATUS_KEY]: { lastOk: now, lastError: null, errorMsg: null },
    });
    return { ok: true, data };
  } else {
    const text = await response.text().catch(() => 'unknown error');
    const errorMsg = `HTTP ${response.status}: ${text}`;
    console.error('[Keryx] Relay failed —', errorMsg);
    await chrome.storage.local.set({
      [STATUS_KEY]: { lastOk: null, lastError: now, errorMsg },
    });
    throw new Error(errorMsg);
  }
}

// ── Test connection (used by popup "Test Ping" button) ────────────────────────
async function testConnection() {
  const { [CONFIG_KEY]: config } = await chrome.storage.local.get(CONFIG_KEY);

  if (!config?.apiKey || !config?.endpoint) {
    console.warn('[Keryx] Test ping skipped — no config stored.');
    return { ok: false, error: 'No API key configured.' };
  }

  const payload = {
    type: 'event',
    source: 'chrome_extension_ping',
    payload: { action: 'ping', timestamp: new Date().toISOString() },
  };

  console.log('[Keryx] Sending test ping to', config.endpoint);

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify(payload),
    });
    const now = Date.now();
    if (response.ok) {
      console.log('[Keryx] Test ping success — HTTP', response.status);
      await chrome.storage.local.set({
        [STATUS_KEY]: { lastOk: now, lastError: null, errorMsg: null },
      });
      return { ok: true };
    } else {
      const text = await response.text().catch(() => '');
      const msg = `HTTP ${response.status}: ${text}`;
      console.error('[Keryx] Test ping failed —', msg);
      await chrome.storage.local.set({
        [STATUS_KEY]: { lastOk: null, lastError: now, errorMsg: msg },
      });
      return { ok: false, error: msg };
    }
  } catch (err) {
    const now = Date.now();
    console.error('[Keryx] Test ping network error:', err.message);
    await chrome.storage.local.set({
      [STATUS_KEY]: { lastOk: null, lastError: now, errorMsg: err.message },
    });
    return { ok: false, error: err.message };
  }
}
