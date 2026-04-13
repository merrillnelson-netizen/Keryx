# Keryx - Replit Configuration

## Overview
Keryx (Kinetic Enterprise & Resource Yielding X-system) is an AI-powered, mobile-first voice logging and search system. It allows users to record free-form natural language memories via voice or text, which are then processed by AI to extract topic tags and structured metadata. The system offers semantic search using AI embeddings combined with structured filters. The project aims to deliver a robust, production-ready application with a modern UI/UX, focusing on cognitive search, proactive insights, calendar/email integration, and AI task execution, ultimately providing a comprehensive "Life OS" experience.

## User Preferences
Preferred communication style: Simple, everyday language.
Mobile-first design: Prioritize mobile experience with responsive layouts and touch-friendly interactions.
Code Quality: Production-ready with comprehensive error handling, memory management, and performance optimization.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite.
- **UI**: Tailwind CSS, shadcn/ui components, glassmorphism design, dark/light theme.
- **State Management**: TanStack Query.
- **Speech APIs**: Browser's native Web Speech API.
- **Companion App**: React Native project for Meta Glasses integration. Settings card at `client/src/components/settings/companion-app-card.tsx` shows setup steps, server URL, and Picovoice links.
- **PWA Support**: Full PWA capabilities including manifest, service worker, Web Share Target, App Shortcuts, App Badge API, Haptic Feedback, Screen Wake Lock, and Offline Action Queuing.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ES modules).
- **API**: RESTful with consistent error handling.
- **Database ORM**: Drizzle ORM for PostgreSQL.
- **Session Management**: Express sessions with PostgreSQL store.
- **Rate Limiting**: Per-user rate limiting on AI routes.

### Monetization
- **Stripe Integration**: Supports Free, Pro, and Life OS tiers with per-route gating based on user subscription. Managed through Replit Stripe integration connector and `stripe-replit-sync` for webhook handling and data synchronization.

### AI Personality Control (Sass-o-Meter)
- **Dynamic Persona**: AI persona adjusted via `sassLevel` and `professionalMode` settings, influencing AI responses across various features.
- **Tiered Access**: UI caps `sassLevel` based on user's subscription tier.

### Database
- **Database**: PostgreSQL (Neon serverless).
- **Schema**: Comprehensive schema including `users`, `log_entries`, `settings`, `categories`, `people`, `aiActions`, `ai_cache`, `location_history`, `pushSubscriptions`, `ideas`, `goals`, `reminders`, `messageConversations`, `messages`.
- **Features**: Strategic indexes, JSONB for metadata, vector type for embeddings, user data isolation.

### Timezone Handling
- **UTC Storage**: All timestamps stored in UTC in PostgreSQL.
- **User Timezone**: Stored in `settings.userTimezone` and used for AI prompts, frontend display, calendar events, and "On This Day" features to ensure local time context.

### Core Features & Design Principles
- **AI Processing**: OpenAI GPT for metadata extraction, action detection, and semantic search embeddings (`text-embedding-3-small`).
- **Voice Processing**: Browser SpeechRecognition API, OpenAI Whisper for voice notes.
- **Hybrid Search**: Combines semantic similarity with structured filters.
- **Cognitive Search**: Mood tracking, people detection, mood distribution charts.
- **Memory Management**: AI-assigned importance levels, expanded categories, AI thematic synthesis.
- **Productivity Tools**: Ideas & Workspace, Goals Tracking System, Reminders System (time-based and location-based).
- **Proactive Features**: AI-generated morning briefings, pattern alerts, contextual discoveries (using Tavily AI Search). Proactive analysis engine (`server/proactive-service.ts`) runs after briefings and on daily schedule to propose reach-out, goal update, and insight surfacing actions.
- **Personal Insights**: AI-generated insights from various data sources.
- **People Management**: Closeness scores, AI People Search (natural language queries), AI Duplicate Detection, and a streamlined People Merge UX.
- **Integrations**: Multi-provider Calendar & Email integration, Meta Glasses integration (MCP Protocol 2025-01).
- **Universal Relay API**: Inbound gateway at `POST /api/relay/inbound` (X-API-Key auth). Accepts `sms`, `command`, and `event` payload types from any external source (Android bridge, Meta glasses). Fan-out routing to configurable destinations. Full event log. Session-authenticated test endpoint at `POST /api/relay/test`. Relay API key managed in Settings UI. Outbound relay (`RELAY_OUTBOUND` action) posts to configured destinations via HTTP.
- **Automation Rules Engine**: IFTTT-style automation at `server/automation-engine.ts`. Triggers: memory.logged, mood.dropped, mood.spiked, person.mentioned, keyword.detected, reminder.due, briefing.generated, goal.updated, daily.schedule, action.completed. Actions: send notification, create reminder, create AI action, log memory, relay outbound. CRUD API at `GET/POST/PATCH/DELETE /api/automation/rules` (Pro tier). UI integrated into `/agent` page under "Automations" tab. Test and toggle endpoints included. Daily run limits per rule (default 3).
- **Action Chaining**: `CHAIN_SEQUENCE` action type spawns ordered child AI actions (up to 10 steps) when approved. Each step appears as a separate pending action in the Agent dashboard.
- **Android Bridge** (`android-bridge/`): Native Kotlin Android app (minSdk 26) that captures Google Messages in real time without requiring a browser. NotificationListenerService captures all incoming messages (SMS, MMS, RCS) and best-effort outgoing RCS. SMS ContentObserver foreground service captures sent SMS/MMS via Android content provider. OkHttp relay client with 2.5s debounce buffer, Keep-Alive reuse, EncryptedSharedPreferences, libphonenumber E.164 normalization, Room retry queue, WorkManager retry with NetworkType.CONNECTED gating (6 attempts, exponential backoff). BootReceiver restarts on reboot. Battery optimization exemption prompt on first launch. Built via GitHub Actions (`.github/workflows/android-bridge.yml`) — APK served from Keryx Settings page once built. Settings card at `client/src/components/settings/android-bridge-card.tsx` shows last-seen status, credentials for copy, and APK download link.
- **Location Features**: Google Timeline import, automatic capture, frequent place detection.
- **Messaging**: SMS/MMS/RCS import with AI-powered conversation analysis, chat bubble UI.

### Security Measures
- **Authentication**: Session-based authentication for all API routes.
- **Data Isolation**: All database queries filter by `userId`.
- **Authorization**: Direct Object Reference Prevention.
- **Webhook Validation**: HMAC-SHA256 signature validation for Telegram.
- **Input Validation**: Zod schemas for all API request bodies.

## External Dependencies

### Core Technologies
- **AI**: OpenAI GPT.
- **Database**: Neon PostgreSQL.
- **ORM**: Drizzle ORM.
- **UI Components**: Radix UI primitives (via shadcn/ui).
- **Styling**: Tailwind CSS.
- **Icons**: Lucide React.

### Browser APIs
- **Speech Recognition**: Web Speech API.
- **Speech Synthesis**: Web Speech Synthesis API.
- **Media**: `getUserMedia`.
- **Geolocation**: Browser Geolocation API.

### Integrations & Services
- **Google Calendar**: Replit google-calendar connector.
- **Outlook Calendar**: Replit outlook connector.
- **Gmail**: Replit google-mail connector.
- **Telegram**: Telegram Bot API.
- **Wake Word Detection**: Picovoice Porcupine SDK.
- **Google Places API**: For reverse geocoding.
- **Plaid**: Financial integration.
- **Tavily AI Search**: For contextual discoveries.
- **Stripe**: Payment processing and subscription management.

### Analytics
- **Google Analytics 4**: For user behavior tracking.

### Hosting Platform
- **Platform**: Replit.