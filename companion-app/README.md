# Keryx Companion App

React Native companion app for Keryx - enables hands-free voice interaction with Oakley Meta HSTN glasses.

## Features

- **Wake Word Detection**: "Hey Keryx" activation using Picovoice Porcupine
- **Bluetooth SCO Audio**: Routes audio through connected Meta glasses
- **Geofenced Context**: Enriches memories with location data via GPS + Google Places
- **Voice Commands**: Natural language processing for record/query actions
- **TTS Feedback**: Spoken responses through glasses speakers

## Prerequisites

1. **Picovoice Account**: Get an access key at https://console.picovoice.ai
2. **Google Places API Key**: For reverse geocoding (optional)
3. **Keryx Backend**: Running instance of the Keryx web app

## Setup

### 1. Install Dependencies

```bash
cd companion-app
npm install
cd ios && pod install && cd ..
```

### 2. Configure API Keys

Create a `.env` file:

```env
PICOVOICE_ACCESS_KEY=your_picovoice_key
GOOGLE_PLACES_API_KEY=your_google_key
KERYX_API_URL=https://your-keryx-instance.replit.app
```

### 3. Train Custom Wake Word (Optional)

1. Go to https://console.picovoice.ai
2. Create a new wake word model for "Hey Keryx"
3. Download the `.ppn` file
4. Place in `android/app/src/main/assets/` and `ios/` directories

### 4. Run the App

```bash
# iOS
npm run ios

# Android
npm run android
```

## Architecture

```
companion-app/
├── src/
│   ├── App.tsx              # Main application component
│   ├── hooks/
│   │   └── useKeryx.ts      # Main state management hook
│   ├── services/
│   │   ├── api.ts           # Keryx backend API client
│   │   ├── wakeWord.ts      # Picovoice Porcupine integration
│   │   ├── bluetooth.ts     # Bluetooth SCO management
│   │   ├── location.ts      # GPS + reverse geocoding
│   │   ├── speech.ts        # STT/TTS services
│   │   └── actionRouter.ts  # Command classification & routing
│   └── types/
│       └── mcp.ts           # MCP payload type definitions
```

## Voice Command Flow

1. Wake word detected ("Hey Keryx")
2. App plays confirmation sound and starts listening
3. User speaks command
4. Action Router classifies intent (record vs query)
5. Request sent to `/api/companion/action` with:
   - Transcript
   - GPS coordinates + place name
   - Device context (glasses model, connection type)
6. Response spoken via TTS

## Supported Commands

### Recording Memories
- "Remember that I met John for coffee today"
- "Note: the meeting went really well"
- "I just finished my morning run at the park"

### Querying Memories
- "What did I do last week?"
- "When did I last see Sarah?"
- "Find memories about my project"

## Permissions

### Android (AndroidManifest.xml)
- `RECORD_AUDIO` - Voice recognition
- `ACCESS_FINE_LOCATION` - GPS context
- `BLUETOOTH_CONNECT` - Glasses connection
- `BLUETOOTH_SCAN` - Device discovery

### iOS (Info.plist)
- `NSMicrophoneUsageDescription`
- `NSLocationWhenInUseUsageDescription`
- `NSBluetoothAlwaysUsageDescription`
- `NSSpeechRecognitionUsageDescription`

## Meta Glasses Compatibility

- Oakley Holbrook Meta (HSTN variant)
- Ray-Ban Meta Smart Glasses
- Other Meta Wearables (when SDK available in 2026)

## License

MIT
