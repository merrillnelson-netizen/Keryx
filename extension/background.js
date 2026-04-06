/**
 * Keryx SMS Relay — background.js (Service Worker, MV3)
 *
 * Responsibilities:
 *  - Receive relay_sms messages from content.js
 *  - POST them to /api/relay/inbound using the stored API key + endpoint
 *  - Track connection status (last 200 OK timestamp) in chrome.storage.local
 *  - Provide status to popup.js via chrome.runtime.onMessage
 */

'use strict';

const STATUS_KEY = 'keryx_relay_status'; // { lastOk, lastError, errorMsg }
const CONFIG_KEY = 'keryx_config';       // { apiKey, endpoint }

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'relay_sms') {
    handleRelaySms(message).then(sendResponse).catch(err => {
      sendResponse({ ok: false, error: err?.message });
    });
    return true; // keep channel open for async response
  }

  if (message.type === 'get_status') {
    chrome.storage.local.get([STATUS_KEY, CONFIG_KEY]).then(result => {
      sendResponse({
        status: result[STATUS_KEY] ?? null,
        config: result[CONFIG_KEY] ? { hasKey: !!result[CONFIG_KEY].apiKey, endpoint: result[CONFIG_KEY].endpoint } : null,
      });
    });
    return true;
  }

  if (message.type === 'save_config') {
    const { apiKey, endpoint } = message;
    chrome.storage.local.set({ [CONFIG_KEY]: { apiKey: apiKey.trim(), endpoint: endpoint.trim() } }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'test_ping') {
    testConnection().then(sendResponse).catch(err => sendResponse({ ok: false, error: err?.message }));
    return true;
  }
});

// ── Core relay function ───────────────────────────────────────────────────────
async function handleRelaySms({ address, body, direction, timestamp }) {
  const { [CONFIG_KEY]: config } = await chrome.storage.local.get(CONFIG_KEY);
  if (!config?.apiKey || !config?.endpoint) {
    throw new Error('Keryx not configured. Open the extension popup and save your API key.');
  }

  const payload = {
    type: 'sms',
    source: 'chrome_extension',
    address,
    body,
    direction: direction ?? 'received',
    timestamp,
  };

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const now = Date.now();
  if (response.ok) {
    const data = await response.json();
    await chrome.storage.local.set({
      [STATUS_KEY]: { lastOk: now, lastError: null, errorMsg: null },
    });
    return { ok: true, data };
  } else {
    const text = await response.text().catch(() => 'unknown error');
    const errorMsg = `${response.status}: ${text}`;
    await chrome.storage.local.set({
      [STATUS_KEY]: { lastOk: null, lastError: now, errorMsg },
    });
    throw new Error(errorMsg);
  }
}

// ── Test connection (used by popup "Test" button) ─────────────────────────────
async function testConnection() {
  const { [CONFIG_KEY]: config } = await chrome.storage.local.get(CONFIG_KEY);
  if (!config?.apiKey || !config?.endpoint) {
    return { ok: false, error: 'No API key configured.' };
  }

  const payload = {
    type: 'event',
    source: 'chrome_extension_ping',
    payload: { action: 'ping', timestamp: new Date().toISOString() },
  };

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify(payload),
    });
    const now = Date.now();
    if (response.ok) {
      await chrome.storage.local.set({ [STATUS_KEY]: { lastOk: now, lastError: null, errorMsg: null } });
      return { ok: true };
    } else {
      const text = await response.text().catch(() => '');
      const msg = `${response.status}: ${text}`;
      await chrome.storage.local.set({ [STATUS_KEY]: { lastOk: null, lastError: now, errorMsg: msg } });
      return { ok: false, error: msg };
    }
  } catch (err) {
    const now = Date.now();
    await chrome.storage.local.set({ [STATUS_KEY]: { lastOk: null, lastError: now, errorMsg: err.message } });
    return { ok: false, error: err.message };
  }
}
