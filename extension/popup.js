'use strict';

const $ = id => document.getElementById(id);

const dot       = $('status-dot');
const statusText = $('status-text');
const statusTime = $('status-time');
const apiKeyInput = $('api-key-input');
const endpointInput = $('endpoint-input');
const saveBtn   = $('save-btn');
const testBtn   = $('test-btn');
const clearBtn  = $('clear-btn');
const toggleBtn = $('toggle-key-btn');
const alertEl   = $('alert');

// ── Helpers ───────────────────────────────────────────────────────────────────
function showAlert(msg, type = 'success') {
  alertEl.textContent = msg;
  alertEl.className = `alert ${type}`;
  alertEl.style.display = 'block';
  setTimeout(() => { alertEl.style.display = 'none'; }, 4000);
}

function formatTime(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setStatus(state, label, time = '') {
  dot.className = `status-dot ${state}`;
  statusText.textContent = label;
  statusTime.textContent = time;
}

// ── Load current config & status ──────────────────────────────────────────────
async function loadState() {
  chrome.runtime.sendMessage({ type: 'get_status' }, (result) => {
    if (chrome.runtime.lastError || !result) {
      setStatus('red', 'Extension not responding');
      return;
    }

    const { status, config } = result;

    if (!config?.hasKey) {
      setStatus('yellow', 'Not configured — add your API key below');
      return;
    }

    if (status?.lastOk && (!status.lastError || status.lastOk > status.lastError)) {
      setStatus('green', 'Connected — last relay successful', formatTime(status.lastOk));
    } else if (status?.lastError) {
      setStatus('red', `Error: ${status.errorMsg ?? 'unknown'}`, formatTime(status.lastError));
    } else {
      setStatus('yellow', 'Configured — no activity yet');
    }

    if (config?.endpoint) endpointInput.value = config.endpoint;
  });

  // Load stored API key (masked)
  const result = await chrome.storage.local.get('keryx_config');
  if (result.keryx_config?.apiKey) {
    apiKeyInput.value = result.keryx_config.apiKey;
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const endpoint = endpointInput.value.trim();
  if (!apiKey || !endpoint) {
    showAlert('Both API key and endpoint are required.', 'error');
    return;
  }
  if (!endpoint.startsWith('https://')) {
    showAlert('Endpoint must start with https://', 'error');
    return;
  }
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  chrome.runtime.sendMessage({ type: 'save_config', apiKey, endpoint }, () => {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
    showAlert('Configuration saved!', 'success');
    setStatus('yellow', 'Saved — send a test ping to verify');
  });
});

// ── Test Ping ─────────────────────────────────────────────────────────────────
testBtn.addEventListener('click', () => {
  testBtn.disabled = true;
  testBtn.textContent = 'Pinging…';
  setStatus('yellow', 'Sending ping…');
  chrome.runtime.sendMessage({ type: 'test_ping' }, (result) => {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Ping';
    if (result?.ok) {
      setStatus('green', 'Connected — ping successful', 'just now');
      showAlert('Ping successful! Keryx received the event.', 'success');
    } else {
      setStatus('red', `Ping failed: ${result?.error ?? 'unknown error'}`);
      showAlert(`Failed: ${result?.error ?? 'unknown error'}`, 'error');
    }
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  if (!confirm('Clear API key and endpoint?')) return;
  chrome.storage.local.remove(['keryx_config', 'keryx_relay_status', 'keryx_seen_messages'], () => {
    apiKeyInput.value = '';
    endpointInput.value = '';
    setStatus('yellow', 'Cleared — re-enter your credentials');
    showAlert('Configuration cleared.', 'success');
  });
});

// ── Toggle key visibility ─────────────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleBtn.textContent = '🙈';
  } else {
    apiKeyInput.type = 'password';
    toggleBtn.textContent = '👁';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadState();
