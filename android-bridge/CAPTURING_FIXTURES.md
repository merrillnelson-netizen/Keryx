# Capturing real on-device notification fixtures

The Bridge parser is regression-tested by JSON fixtures under
`app/src/test/resources/fixtures/`. The synthetic fixtures already in
that directory pin the parser's *current* behavior, but they cannot
catch surprises — for example, a future Google Messages release that
packs `MessagingStyle` fields in a slightly different shape than we
expect. Capturing a small set of **real** notifications from a working
device closes that gap. Once committed to `fixtures/real/`, they're
exercised on every `./gradlew test` run by
`BridgeParserRealFixturesTest`.

> **You need a physical Android device** with the Bridge installed and
> notification access granted. This cannot be done in CI or by the
> agent — it's a one-time engineering chore.

---

## 1. Build a debug APK with fixture dumping enabled

1. Open `app/src/main/java/app/keryx/bridge/parser/BridgeFixtureDump.kt`.
2. Flip `DUMP_ENABLED` from `false` to `true`.
3. Build a debug APK:
   ```bash
   cd android-bridge
   ./gradlew assembleDebug
   ```
4. Install on your device:
   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

Because `DUMP_ENABLED` is a compile-time `const`, the dump call is
completely elided in release builds — there is no risk of shipping
this to users.

---

## 2. Capture the dumps from logcat

In one terminal, start a logcat filter that only shows the dump tag:

```bash
adb logcat -c                                         # clear old logs
adb logcat -s KeryxFixtureDump:I -v raw > captured.log
```

On the phone, trigger each scenario you want to capture. Aim for the
six the synthetic suite already covers:

| # | Scenario                          | How to trigger                                 |
|---|-----------------------------------|------------------------------------------------|
| 1 | Incoming RCS (MessagingStyle)     | Have someone send you a single RCS message.    |
| 2 | Outgoing RCS                      | Send a reply yourself; capture the post.       |
| 3 | Incoming SMS (simple)             | Have someone on a non-RCS network text you.    |
| 4 | Group chat (multi-message)        | Receive 2–3 messages in a group within ~10 s.  |
| 5 | Count-only summary                | Wait for "N new messages" rollup.              |
| 6 | Group summary (FLAG_GROUP_SUMMARY)| Same as 5 — Android often posts both.          |

Each notification produces one self-contained JSON blob in `captured.log`.
Look for the `"scenario": "REAL_CAPTURE_TODO_RENAME"` marker that opens
each blob.

---

## 3. Anonymize before saving

For **every** fixture, before saving it under `fixtures/real/`:

- **Phone numbers** → `+15555550100`-series placeholders
  (RFC-5737-equivalent for phones; the 555-01xx block is reserved).
- **Contact names** → generic stand-ins like `Mel`, `Sam`, `Jamie`.
- **Message bodies** → paraphrase so no real personal content ships in
  CI. Keep the *length* and *shape* (emojis, line breaks, status
  prefixes) so the parser's behavior on edge cases is preserved.
- **Timestamps** → either keep as-is (they're harmless) or normalize to
  the existing fixtures' anchor (`1700000000000` =
  `2023-11-14T22:13:20Z`) so timestamp assertions stay tidy.

---

## 4. Fill in the expected block

Each captured dump ships with a stub:

```json
"expected": { "skipReason": null, "diagnostic": false, "payloads": [] }
```

Replace it with the assertion you want enforced — either a populated
`payloads` array or a `skipReason` string. Mirror the schema in
`fixtures/incoming_rcs_messagingstyle.json` (it's the canonical
reference). Rename `"scenario"` to something descriptive
(e.g. `real_incoming_rcs_messagingstyle`) so failures point at the
right capture.

---

## 5. Commit and verify

1. Save the file as
   `app/src/test/resources/fixtures/real/<scenario>.json`.
2. Run the JVM test suite:
   ```bash
   ./gradlew test
   ```
   `BridgeParserRealFixturesTest` discovers everything in
   `fixtures/real/` automatically. No Kotlin edits required.
3. **Flip `DUMP_ENABLED` back to `false`** in `BridgeFixtureDump.kt`
   before committing — the dump should never ship to a user, even in a
   debug APK that someone might side-load.
4. Commit the new JSON fixture(s) and the `DUMP_ENABLED = false`
   reset together.

---

## Troubleshooting

- **Logcat shows nothing under `KeryxFixtureDump`** — confirm the
  `DUMP_ENABLED` flag is `true` *and* you're running the freshly built
  APK (`adb install -r` should have replaced it). Also confirm the
  Bridge has notification access granted on the device (Settings →
  Special app access → Notification access).
- **JSON has `"<SpannableString>"`-style markers** — that's expected
  for unusual extras keys we don't capture verbatim. The fields the
  parser actually consumes (`android.title`, `android.text`,
  `android.bigText`, `android.messages`) are always rendered as
  proper strings/arrays.
- **`./gradlew test` fails after dropping a fixture in** — that's the
  point. Read the failure: it tells you exactly which payload field
  diverged. Either the parser regressed (fix the parser) or the
  `expected` block was wrong for that scenario (fix the fixture).
