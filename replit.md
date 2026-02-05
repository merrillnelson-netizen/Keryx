# Keryx - Replit Configuration

## Overview
Keryx (Kinetic Enterprise & Resource Yielding X-system) is an AI-powered, mobile-first voice logging and search system. It allows users to record free-form natural language memories via voice or text, which are then processed by AI to extract topic tags and structured metadata. The system offers semantic search using AI embeddings combined with structured filters. The project aims to deliver a robust, production-ready application with a modern UI/UX, focusing on cognitive search, proactive insights, calendar/email integration, and AI task execution.

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
- **Environment**: Validation for critical environment variables.

### Database
- **Database**: PostgreSQL (Neon serverless).
- **Schema**: Includes tables for `users`, `log_entries`, `settings`, `categories`, `people`, `aiActions`, `aiActionPreferences`, `ai_cache`, `location_history`, `frequent_places`, `pushSubscriptions`, `ideas`, `ideaTasks`, `goals`, `reminders`.
- **Features**: Strategic indexes, JSONB for metadata, vector type for embeddings, user data isolation.

### Performance Optimizations
- **AI Caching**: 30-minute TTL cache for briefings and alerts.
- **Frontend Pagination**: `useInfiniteQuery` with "Load More" buttons.
- **Embedding Optimization**: Embeddings regenerated only when `memoryText` changes.
- **Lightweight Endpoints**: Consolidated `/api/dashboard/stats` endpoint.
- **Parallel Data Fetching**: AI endpoints use `Promise.all` for parallel data retrieval.
- **Lightweight Memory Queries**: Excludes heavy fields for AI prompt assembly.
- **Frontend Query Caching**: `staleTime` configured for major queries.

### Core Features & Design Principles
- **AI Processing**: OpenAI GPT for metadata extraction and action detection; `text-embedding-3-small` for embeddings.
- **Voice Processing**: Browser SpeechRecognition API, OpenAI Whisper API for Telegram voice notes.
- **Hybrid Search**: Combines semantic similarity with structured filters.
- **Application Structure**: Monorepo with shared schema, full TypeScript coverage with Zod validation.
- **Key Capabilities**: AI-powered voice input, manual categorization, hybrid search, real-time feedback, mobile-first design, robust error recovery.
- **Cognitive Search**: Mood tracking, people detection, mood distribution charts.
- **Memory Importance Levels**: AI-assigned 1-10 scale, user-adjustable, influencing prioritization in briefings and insights.
- **Expanded Categories**: 15 specific topic categories for memory organization, with AI guidance.
- **AI Thematic Synthesis**: Dedicated page for deep pattern analysis with interactive Q&A.
- **Ideas & Workspace**: Versatile workspace supporting Ideas, Notes, Lists, and Documents with type-aware AI assistance.
- **Goals Tracking System**: Manages long-term goals with AI-powered progress tracking, milestones, and integration into briefings.
- **Reminders System**: Manages time-based and location-based reminders, AI auto-detection from input, and integration into briefings.
- **Proactive Features**: AI-generated morning briefings, pattern alerts, goal pattern alerts, contextual discoveries.
- **Personal Insights**: AI-generated insights from user data (memories, calendars, emails, finances).
- **Contextual Discoveries**: Uses Tavily AI Search for personalized content based on user insights.
- **People Closeness Score**: Priority system (1-10) for people, enabling High-Signal Alerts.
- **Calendar & Email Integration**: Multi-provider support for auto-linking memories to events.
- **AI Task Execution**: Detection of actionable requests with policy-based approval.
- **Telegram Integration**: Record memories via text/voice notes, account linking, outbound notifications.
- **Meta Glasses Integration**: MCP Protocol 2025-01 compliant payloads, geolocation capture.
- **Location History**: Google Timeline import, automatic capture, frequent place detection, location clustering.
- **Web Push Notifications**: For briefings, alerts, and approvals, handled by a service worker.
- **Life Purpose Suggestion**: AI detects existential themes and suggests a companion app.

### Security Measures
- **Authentication**: All API routes require session authentication.
- **User Data Isolation**: All database queries filter by `userId`.
- **Direct Object Reference Prevention**: Validates object ownership before modification.
- **Telegram Webhook Protection**: HMAC-SHA256 signature validation.
- **Rate Limiting**: Per-user rate limiting on AI routes.
- **Input Validation**: Zod schemas validate all API request bodies.

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
- **Plaid**: Financial integration for bank accounts and spending insights.
- **Tavily AI Search**: For contextual discoveries.

### Analytics
- **Google Analytics 4**: For user behavior tracking.

### Hosting Platform
- **Platform**: Replit.