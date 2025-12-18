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
- **Timeline Page** (`/timeline`): Chronological memories grouped by month, visual mood indicators, "On This Day" time capsule.
- **Enhanced History**: Mood badges (emoji + score) and people badges on memory cards/table rows.

### Phase 2: Proactive Features (Completed)
- **Dashboard** (`/`): New landing page with daily briefing and pattern alerts.
- **Morning Briefing**: AI-generated personalized summary with greeting, focus areas, reminders, mood trend, and affirmation.
- **Pattern Alerts**: AI detects positive/negative/insight patterns from recent memories, color-coded cards.
- **API Endpoints**: `/api/briefing` (7-day analysis), `/api/alerts` (14-day pattern detection).
- **AI Functions**: `generateMorningBriefing()`, `detectPatternAlerts()` in `server/ai-service.ts`.
- **Navigation**: 7 items - Dashboard, Voice Log, History, Insights, People, Timeline, Settings.
- **Preparation Mode**: Planned for future (requires calendar/event integration).

### Phase 3: Hands-Free Activation (Planned)
- **Wake Word Detection**: "Hey Helix" trigger using Picovoice Porcupine WebAssembly library.
- **Always-On Listener**: Opt-in background listening with clear privacy controls and visual indicator.
- **Browser Requirements**: HTTPS, microphone permission, active tab (Safari/iOS limited support).
- **Implementation**: Web Audio API + Porcupine WASM worker for low-latency, on-device detection.
- **Custom Wake Word**: Train "Hey Helix" via Picovoice Console (text-to-model).

### Phase 4: Meta Glasses Integration (Planned)
- **Meta Wearables SDK**: Integration with Meta Wearables Device Access Toolkit (developer preview 2025, GA 2026).
- **Quick Capture**: Deep link `/quick-capture` for Meta AI routines to launch Helix directly.
- **Voice Commands**: "Hey Meta, open Helix" routine for hands-free memory logging.
- **Companion Bridge**: Mobile/PWA intent handler for glasses-to-Helix communication.
- **Limitations**: Custom Meta AI voice commands not available in initial SDK preview.
- **Workaround**: GitHub `dcrebbin/meta-glasses-api` for unofficial Messenger-based integration.

### Future Phases
- **Phase 5 (Life Integration)**: Photos, location tracking, shared memories.
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