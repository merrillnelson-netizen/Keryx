# Helix - Replit Configuration

## Overview
Helix is an AI-powered mobile-first voice logging and search system. It allows users to log free-form natural language memories via voice or text, which are then processed by OpenAI GPT to extract topic tags and structured metadata. The system features semantic search using OpenAI embeddings combined with structured filters for powerful hybrid search capabilities. The project aims to provide a robust, production-ready application with a modern UI/UX and efficient performance.

## User Preferences
Preferred communication style: Simple, everyday language.
Mobile-first design: Prioritize mobile experience with responsive layouts and touch-friendly interactions.
Code Quality: Production-ready with comprehensive error handling, memory management, and performance optimization.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Vite build tool.
- **UI Framework**: Tailwind CSS with shadcn/ui components.
- **Design System**: Modern glassmorphism with gradient backgrounds, Inter font, dark/light theme support.
- **Layout**: Unified AppLayout for responsive navigation (desktop sidebar, mobile drawer).
- **Routing**: Wouter for lightweight client-side routing.
- **State Management**: TanStack Query (React Query) for server state.
- **Error Handling**: React ErrorBoundary for graceful recovery.
- **Speech APIs**: Browser's native Web Speech API for recognition and synthesis.

### Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful endpoints with consistent error handling and standardized JSON responses.
- **Database ORM**: Drizzle ORM for type-safe PostgreSQL operations.
- **Session Management**: Express sessions with PostgreSQL store via `connect-pg-simple`.
- **Rate Limiting**: Per-user rate limiting on AI routes (20 req/min) to prevent OpenAI quota issues.
- **Environment Validation**: Startup validation for critical environment variables (OPENAI_API_KEY, SESSION_SECRET, DATABASE_URL).

### Database Design
- **Database**: PostgreSQL with Neon serverless deployment.
- **Optimization**: Strategic indexes for performance (timestamp, topic tag, HNSW vector, composite indexes).
- **Schema**: `users`, `log_entries`, `settings`, `categories`, `people` tables.
- **Data Storage**: JSONB for flexible metadata, vector type for embeddings.
- **User Data Isolation**: All data filtered by `userId` with foreign key relationships.
- **Phase 1 Fields**: `log_entries` includes `mood`, `moodScore`, `detectedPeople` for cognitive tracking.

### Voice Processing Pipeline
- **Speech Recognition**: Browser's SpeechRecognition API.
- **AI Processing**: OpenAI GPT for metadata extraction and GPT-4o-mini for query decomposition.
- **Embedding Generation**: OpenAI `text-embedding-3-small` for 1536-dimensional vectors.
- **Hybrid Search**: Combines semantic similarity with structured filters.
- **Response Generation**: Text-to-speech feedback using SpeechSynthesis API.

### Application Structure
- **Monorepo**: Shared schema between client and server in `/shared`.
- **Type Safety**: Full TypeScript coverage with Zod runtime validation.
- **Key Features**: AI-powered voice input, manual category selection with inline editing, hybrid search, real-time feedback, mobile-first design, robust error recovery, and optimized performance.

### Phase 1: Cognitive Search & Insights (Completed)
- **Mood Tracking**: AI extracts mood (emotion word) and moodScore (-100 to +100) from each memory.
- **People Detection**: AI identifies mentioned people, stored in `detectedPeople` array and tracked in `people` table.
- **Insights Page** (`/insights`): Mood distribution charts (pie + bar), AI thematic synthesis with custom questions.
- **People Page** (`/people`): Grid of tracked people with mention counts, relationship editing, view memories by person.
- **Timeline Page** (`/timeline`): Meeting Memories view showing only calendar-linked memories with Calendar/Card/Table views, interactive month grid with day-click detail view.
- **Enhanced History**: Mood badges (emoji + score) and people badges on memory cards/table rows.

### Phase 2: Proactive Features (Completed)
- **Dashboard** (`/` for authenticated users): Daily briefing and pattern alerts.
- **Morning Briefing**: AI-generated personalized summary with greeting, focus areas, reminders, mood trend, and affirmation.
- **Pattern Alerts**: AI detects positive/negative/insight patterns from recent memories, color-coded cards.
- **API Endpoints**: `/api/briefing` (7-day analysis), `/api/alerts` (14-day pattern detection).
- **AI Functions**: `generateMorningBriefing()`, `detectPatternAlerts()` in `server/ai-service.ts`.
- **Navigation**: 7 items - Dashboard, Voice Log, History, Insights, People, Timeline, Settings.
- **Preparation Mode**: Planned for future (requires calendar/event integration).

### Landing Page & Marketing (Completed)
- **Public Landing Page** (`/` for unauthenticated users): Professional marketing page with animated hero section.
- **Features**: Hero with gradient text, feature grid (6 capabilities), benefits section, testimonials, CTA sections.
- **Design**: Glassmorphism cards, Framer Motion animations, responsive mobile-first layout.
- **Session Category**: Power user feature in Settings to auto-tag memories during extended sessions (uses browser session storage, resets on close).
- **Simplified Auth Pages**: Clean login/signup forms with "Back to home" navigation.

### Phase 3: Meta Glasses Integration (Completed)
- **Architecture**: Hybrid system - web app (desktop/browser) + React Native companion app (glasses/mobile) sharing Express/PostgreSQL backend.
- **Companion App**: Located in `/companion-app/`, React Native project with TypeScript.
- **MCP Protocol**: Model Context Protocol 2025-01 compliant payloads for structured communication.
- **Geolocation**: Browser Geolocation API captures GPS coordinates when recording memories, with Google Maps links in History view.

### Phase 4: Calendar & Email Integration (Completed)
- **Multi-Provider Support**: Both Google and Microsoft (Outlook) providers supported for calendar and email.
- **Provider Preference**: Users can select preferred provider in Settings; clicking a provider card makes it active.
- **Google Calendar**: Connected via Replit google-calendar connector.
- **Outlook Calendar**: Connected via Replit outlook connector.
- **Gmail**: Connected via Replit google-mail connector for email operations.
- **Outlook Mail**: Shares connection with Outlook calendar connector.
- **Architecture Note**: Integrations are connected at the Replit app level (single-tenant), not per-user.
- **Auto-linking**: Memories recorded during meetings automatically link to calendar events.
- **Smart Event Detection**: AI analyzes memories to detect future events and suggests adding them to calendar.
- **Event Creation**: Create calendar events directly from voice memories with duplicate detection.
- **Data Management**: Re-analyze feature in Settings runs in background with progress polling.
- **Calendar Fields**: `calendarEventId`, `calendarEventTitle`, `calendarEventAttendees` on log_entries.
- **Settings Schema**: `calendarProvider`, `emailProvider`, `providerSelectionMode` for user preferences.
- **Settings Page**: Shows both calendar providers (Google/Outlook) and email providers (Gmail/Outlook) with connection status and active selection.
- **History View**: Purple calendar badges show linked meeting names with attendee tooltips.
- **Timeline Page**: Calendar view with All/Calendar filter, month navigation and day-click details with Card/Table views.
- **API Endpoints**: `/api/calendar/status`, `/api/email/status`, `/api/providers/status` (combined), `/api/calendar/events/*`.
- **Service Files**: `server/calendar-service.ts`, `server/outlook-calendar-service.ts`, `server/gmail-service.ts`, `server/outlook-mail-service.ts`.
- **AI Function**: `detectCalendarEvent()` in `server/ai-service.ts` - extracts event details from natural language.

#### Backend API Extensions
- **New Endpoint**: `POST /api/companion/action` - Unified MCP action handler.
- **Geolocation Fields**: `geoLat`, `geoLng`, `geoPlaceId`, `geoPlaceName`, `geoAccuracyMeters` on log_entries.
- **Device Context**: `deviceId`, `deviceType` (oakley-hstn, meta-glasses, phone, web), `deviceConnection` (bluetooth-sco, bluetooth-a2dp, usb, wifi).
- **Schema Types**: `geoContextSchema`, `deviceContextSchema`, `audioContextSchema`, `mcpPayloadSchema` in `shared/schema.ts`.

#### Companion App Services
- **Wake Word Detection**: Picovoice Porcupine SDK for "Hey Helix" activation (`src/services/wakeWord.ts`).
- **Bluetooth SCO**: Audio routing through Meta glasses (`src/services/bluetooth.ts`).
- **Location Service**: GPS capture + Google Places reverse geocoding (`src/services/location.ts`).
- **Speech Service**: STT/TTS for voice interactions (`src/services/speech.ts`).
- **Action Router**: Intent classification (record vs query) and API calls (`src/services/actionRouter.ts`).
- **API Client**: Helix backend communication (`src/services/api.ts`).

#### Supported Devices
- Oakley Holbrook Meta (HSTN variant)
- Ray-Ban Meta Smart Glasses
- Future Meta Wearables (SDK GA 2026)

#### Setup Requirements
- Picovoice Access Key (https://console.picovoice.ai)
- Google Places API Key (optional, for reverse geocoding)
- Custom "Hey Helix" wake word model (.ppn file)

### Future Phases
- **Phase 5 (Life Integration)**: Photos, shared memories.
- **Phase 6 (Privacy Hardening)**: End-to-end encryption, selective AI processing.

## External Dependencies

### Core Technologies
- **AI**: OpenAI GPT (various models for extraction, decomposition, embeddings).
- **Database**: Neon PostgreSQL.
- **ORM**: Drizzle ORM.
- **UI Components**: Radix UI primitives via shadcn/ui.
- **Styling**: Tailwind CSS.
- **Icons**: Lucide React.
- **Session Store**: `connect-pg-simple`.

### Browser APIs
- **Speech Recognition**: Web Speech API.
- **Speech Synthesis**: Web Speech Synthesis API.
- **Media**: `getUserMedia` for microphone access.

### Analytics
- **Google Analytics 4**: Integrated for user behavior tracking and page views.
- **Files**: `client/src/lib/analytics.ts` (core functions), `client/src/hooks/use-analytics.tsx` (route tracking hook).
- **Environment Variable**: `VITE_GA_MEASUREMENT_ID` (required for tracking).
- **Usage**: Import `trackEvent` from `@/lib/analytics` to track custom events.

### Hosting Platform
- **Platform**: Replit.