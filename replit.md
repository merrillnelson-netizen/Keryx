# Keryx - Replit Configuration

## Overview
Keryx (Kinetic Enterprise & Resource Yielding X-system) is an AI-powered mobile-first voice logging and search system. It enables users to record free-form natural language memories via voice or text, which are then processed by OpenAI GPT to extract topic tags and structured metadata. The system offers semantic search using OpenAI embeddings combined with structured filters for powerful hybrid search capabilities. The project aims to deliver a robust, production-ready application with a modern UI/UX and efficient performance, focusing on cognitive search, proactive insights, calendar/email integration, and AI task execution.

## User Preferences
Preferred communication style: Simple, everyday language.
Mobile-first design: Prioritize mobile experience with responsive layouts and touch-friendly interactions.
Code Quality: Production-ready with comprehensive error handling, memory management, and performance optimization.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite.
- **UI**: Tailwind CSS, shadcn/ui components, glassmorphism design, dark/light theme.
- **Routing**: Wouter.
- **State Management**: TanStack Query.
- **Speech APIs**: Browser's native Web Speech API for recognition and synthesis.
- **Companion App**: React Native project for Meta Glasses integration, located in `/companion-app/`.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ES modules).
- **API**: RESTful with consistent error handling.
- **Database ORM**: Drizzle ORM for PostgreSQL.
- **Session Management**: Express sessions with PostgreSQL store.
- **Rate Limiting**: Per-user rate limiting on AI routes.
- **Environment**: Validation for critical environment variables (OPENAI_API_KEY, SESSION_SECRET, DATABASE_URL).

### Database
- **Database**: PostgreSQL (Neon serverless).
- **Schema**: `users`, `log_entries`, `settings`, `categories`, `people`, `aiActions`, `aiActionPreferences`, `ai_cache`, `location_history`, `frequent_places`, `pushSubscriptions`, `ideas`, `ideaTasks`, `goals`, `reminders` tables.
- **Features**: Strategic indexes, JSONB for metadata, vector type for embeddings, user data isolation.

### Performance Optimizations
- **AI Caching**: 30-minute TTL cache for briefings and alerts in `ai_cache` table, invalidated on memory changes.
- **Frontend Pagination**: `useInfiniteQuery` with "Load More" buttons (30 items per page) for memory lists.
- **Embedding Optimization**: Embeddings only regenerated when `memoryText` content actually changes.
- **Lightweight Endpoints**: Consolidated `/api/dashboard/stats` endpoint with parallel COUNT queries.
- **Database Indexes**: Comprehensive indexes on user_id, timestamp, topic, mood, calendar fields, and HNSW vector index.
- **Parallel Data Fetching**: AI endpoints (briefing, news-feed) use Promise.all to fetch memories, settings, people, emails, calendar, and financial data in parallel instead of sequentially.
- **Lightweight Memory Queries**: `getRecentLogEntriesLight` method excludes heavy fields (embedding vectors, metadata JSONB) for AI prompt assembly, reducing database payload significantly.
- **Frontend Query Caching**: staleTime configured on all major queries (5-30 minutes based on data volatility) to prevent unnecessary refetches on window focus.
- **Push Notification Delivery**: Parallelized via Promise.allSettled with background cleanup of expired subscriptions.

### Core Features & Design Principles
- **AI Processing**: OpenAI GPT for metadata extraction, GPT-4o-mini for query decomposition and action detection, `text-embedding-3-small` for embeddings.
- **Voice Processing**: Browser SpeechRecognition API, OpenAI Whisper API for Telegram voice notes.
- **Hybrid Search**: Combines semantic similarity with structured filters.
- **Application Structure**: Monorepo with shared schema (`/shared`), full TypeScript coverage with Zod validation.
- **Key Capabilities**: AI-powered voice input, manual categorization, hybrid search, real-time feedback, mobile-first design, robust error recovery.
- **Cognitive Search**: Mood tracking, people detection, mood distribution charts.
- **Memory Importance Levels**: 1-10 scale (1=trivial, 5=default, 10=critical) assigned by AI during metadata extraction based on emotional intensity, future relevance, uniqueness, and life impact. Users can manually adjust importance via slider in edit dialog. High-importance memories (8-10) are prioritized in briefings, insights, and synthesis with [CRITICAL] labels. Visual ImportanceBadge shows priority on memory cards.
- **Expanded Categories**: 15 topic categories for better memory organization: Work, Family, Social, Health, Financial, Shopping, Groceries, Travel, Learning, Home, Recreation, Food, Meeting, Personal, General. AI is instructed to use General only as a last resort. Users can manually reassign categories via the History page. Categories are auto-created per user when new ones are assigned.
- **AI Thematic Synthesis**: Dedicated page (/synthesis) for deep pattern analysis with interactive Q&A chat interface. Auto-generates comprehensive analysis on page load, allows follow-up questions about patterns, habits, mood trends, and recommendations. Configurable time period (7 days to 1 year).
- **Ideas & Workspace**: Versatile workspace (/ideas) supporting multiple types: Ideas (full AI brainstorming with stages), Notes (quick text capture), Lists (checkable items like grocery/packing lists), and Documents (structured content). All types open in full-height modal overlays for a mini-app experience - quick access without page navigation. Type-aware AI assistance provides contextual help - list item suggestions, note summarization, writing feedback for documents, and brainstorming for ideas. Ideas progress through stages: Spark → Exploring → Planning → In Progress → Completed/Dropped. Features include AI chat, task breakdown, and type-specific UIs with tab navigation between content and AI help.
- **Goals Tracking System**: Dedicated page (/goals) for long-term goal management separate from Ideas. Features AI-powered progress tracking that analyzes recent memories to detect goal-related activities. Goals have status (active/paused/completed/abandoned), 0-100 progress percentage, optional target dates, and JSONB milestones. GoalModal provides 3-tab interface: Details (title, description, target date, status), Milestones (AI-suggested or manual with completion tracking), and Progress (AI analysis summary, related memories, achievements, blockers). AI integration includes: analyzeGoalProgress scans 30-day memories for goal mentions, suggestGoalMilestones generates actionable milestones, and detectGoalPatternAlerts identifies stalled goals, at-risk targets, and recent achievements. Goals are integrated into morning briefings with goalUpdates section providing encouraging status updates.
- **Reminders System**: Dedicated page (/reminders) for managing time-based and location-based reminders. Supports two trigger types: time-based ("remind me tomorrow at 3pm") and location-based ("remind me when I'm at the gym"). AI automatically detects reminder intents from voice/text input during memory creation via extractMetadata and auto-creates reminders. Status tracking: pending, triggered, snoozed, completed, dismissed. Features snooze functionality (30m, 1h increments), complete/dismiss actions, and delete for history items. Location-based reminders trigger when a new memory is logged at a matching place. Active reminders are included in morning briefings for daily awareness.
- **Proactive Features**: AI-generated morning briefings (with goal updates and active reminders), pattern alerts, goal pattern alerts (stalled progress, milestone achievements, at-risk targets), active projects, contextual discoveries.
- **Personal Insights**: AI-generated insights from user's ecosystem (memories, calendars, emails, finances) displayed on Insights page. Categories: people, projects, calendar, financial, wellbeing, highlights. Cached with 30-minute TTL.
- **Contextual Discoveries**: Uses Tavily AI Search to provide personalized, ad-free content based on user's life insights (upcoming trips, projects, financial patterns). Extracts searchable insights from calendars (next 7 days), emails, recent memories (last 7 days), and Plaid financial data (notable transactions >$100), then performs contextual searches. Features urgency badges (immediate/upcoming/general), location awareness (detects when visiting new city), and minimum relevance thresholds (0.6). Cached with 30-minute TTL. Requires TAVILY_API_KEY configuration.
- **People Closeness Score**: Priority system (1-10) for people in the People table. Enables High-Signal Alerts when priority 8+ people are mentioned in Tavily discoveries. Priority 10 = VIP (spouse, partner), Priority 9 = Critical (close family, business partners), Priority 8 = High (close friends, key colleagues). High-signal detection uses full-name matching (95% confidence), first+last name matching (75%), and last-name-only matching (50% for unique names).
- **Calendar & Email Integration**: Multi-provider support (Google, Microsoft Outlook) for auto-linking memories to events, smart event detection, and event creation.
- **AI Task Execution**: Detection of actionable requests (calendar, email, reminders) with policy-based approval and rollback capability.
- **Telegram Integration**: Record memories via text/voice notes, account linking, outbound notifications.
- **Meta Glasses Integration**: MCP Protocol 2025-01 compliant payloads, geolocation capture, device context.
- **Location History**: Google Timeline import (supports legacy and semantic JSON formats), automatic location capture from memories, frequent place detection with home/work auto-labeling, custom place naming (Gym, Coffee Shop, etc.), location clustering, and location context integrated into AI briefings and insights.
- **Web Push Notifications**: Enabled via web-push library with VAPID authentication. Sends notifications for briefings, pattern alerts, high-signal VIP mentions, contextual discoveries, and AI action approvals. Uses setImmediate for non-blocking background delivery. Settings page has subscription controls with permission state handling. Service worker at /service-worker.js handles notification clicks with deep linking.
- **Life Purpose Suggestion**: When AI detects existential/philosophical themes in logged memories (e.g., "what is my purpose," "feeling lost," "meaning of life"), shows a gentle suggestion card linking to companion Life Purpose app (https://life-purpose-merrillnelson.replit.app/) with "from the makers of Keryx" messaging. Detection via lifePurposeTheme flag in extractMetadata().

## External Dependencies

### Core Technologies
- **AI**: OpenAI GPT (various models).
- **Database**: Neon PostgreSQL.
- **ORM**: Drizzle ORM.
- **UI Components**: Radix UI primitives (via shadcn/ui).
- **Styling**: Tailwind CSS.
- **Icons**: Lucide React.
- **Session Store**: `connect-pg-simple`.

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
- **Google Places API**: For reverse geocoding (optional).
- **Plaid**: Financial integration for bank accounts and spending insights. Uses Balance as primary product (less approval requirements), Transactions as optional. Batch-optimized database operations for sync.
- **Tavily AI Search**: For contextual discoveries with ad-free, personalized web search results.

### Analytics
- **Google Analytics 4**: For user behavior tracking.

### Hosting Platform
- **Platform**: Replit.

## Security & Quality

### Security Measures
- **Authentication**: All 80+ API routes require session authentication via `requireAuth` middleware.
- **User Data Isolation**: All database queries filter by userId - no cross-user data access possible.
- **Direct Object Reference Prevention**: Idea task routes verify tasks belong to the specified idea before allowing updates/deletes.
- **Telegram Webhook Protection**: HMAC-SHA256 signature validation for incoming webhook payloads.
- **Rate Limiting**: Per-user rate limiting on AI routes to prevent abuse.
- **Input Validation**: Zod schemas validate all API request bodies.

### Code Quality
- **Debug Logging**: Production-appropriate logging (error/warning logs retained, debug logs removed).
- **TypeScript**: Full TypeScript coverage with strict type checking.
- **Error Handling**: Comprehensive try-catch blocks with graceful fallbacks.
- **Memory Management**: Proper cleanup of refs, timeouts, and event listeners in React hooks.

## Recent Changes
- **February 2026**: Reminders System - added dedicated /reminders page with time-based and location-based reminders, AI auto-detection from voice input, snooze/complete/dismiss actions, and integration into morning briefings.
- **February 2026**: Goals Tracking System - added dedicated /goals page with AI-powered progress tracking, milestone management, and integration into morning briefings.
- **February 2026**: Goal Pattern Alerts - added detectGoalPatternAlerts for stalled progress, at-risk targets, milestone achievements.
- **February 2026**: Security audit completed - verified all routes protected, fixed direct object reference in idea tasks.
- **February 2026**: Life Purpose Suggestion auto-scroll enhancement with smooth 400ms delay.
- **February 2026**: Code cleanup - removed debug console.log statements from speech recognition hook.