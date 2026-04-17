# Real on-device notification fixtures

This directory holds anonymized JSON dumps captured from a real Android
device running the Keryx Bridge. Any `*.json` file dropped in here is
picked up automatically by `BridgeParserRealFixturesTest` — no Kotlin
edits required.

**Before committing a new fixture:**

- Replace real phone numbers with `+15555550100`-style placeholders.
- Replace contact names with generic stand-ins (`Mel`, `Sam`, `Jamie`).
- Paraphrase the message body so no real personal content ships in CI.
- Fill in the `description` and `expected` blocks (mirror the schema in
  `../incoming_rcs_messagingstyle.json`).

See `android-bridge/CAPTURING_FIXTURES.md` for the full capture workflow.
