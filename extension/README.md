# Keryx SMS Relay — Chrome Extension

Intercepts Google Messages for Web conversations and relays them to your Keryx life OS in real time.

## Installation (Load Unpacked)

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. The "Keryx SMS Relay" extension will appear with a purple lightning bolt icon

## Setup

1. In Keryx → **Settings → Universal Relay API**, copy:
   - Your **Relay API Key** (`rky_...`)
   - The **Inbound Endpoint** URL
2. Click the extension icon in the Chrome toolbar
3. Paste both values and click **Save**
4. Click **Test Ping** — the status dot should turn green

## How Messages Are Captured

- Open [messages.google.com](https://messages.google.com) in the same browser
- Open any conversation — the extension's content script attaches a **MutationObserver** to the message list
- Each new message is:
  1. **Deduplicated** — hashed by `sender + body + minute-bucket` against a local 24h cache, preventing duplicates on page refresh
  2. **Sent to `background.js`** via `chrome.runtime.sendMessage`
  3. **Background posts** `{ type: "sms", address, body, direction, timestamp }` to `/api/relay/inbound` with your API key
- Keryx stores the message, runs AI analysis, and fans out to any configured destinations (OGBilliards Pro, etc.)

## Payload Shape

```json
{
  "type": "sms",
  "source": "chrome_extension",
  "address": "+15551234567",
  "body": "Hey, are you coming tonight?",
  "direction": "received",
  "timestamp": "2026-04-06T18:30:00.000Z"
}
```

## Privacy & Security

- The API key is stored in `chrome.storage.local` (device-local, not synced)
- All traffic goes over HTTPS
- No data is sent to any third party — only to your Keryx relay endpoint
- Deduplication cache stays on-device

## Troubleshooting

| Status | Meaning |
|--------|---------|
| 🟡 Yellow | Not configured or no activity yet |
| 🟢 Green | Last relay was successful |
| 🔴 Red | Last attempt failed — check the error message |

If messages aren't being captured: Google occasionally updates their DOM structure. Check the browser console on messages.google.com for `[Keryx]` log lines to confirm the observer is attached.
