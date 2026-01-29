# Helix - Replit Configuration

## Overview
Helix is an AI-powered mobile-first voice logging and search system. It enables users to record free-form natural language memories via voice or text, which are then processed by OpenAI GPT to extract topic tags and structured metadata. The system offers semantic search using OpenAI embeddings combined with structured filters for powerful hybrid search capabilities. The project aims to deliver a robust, production-ready application with a modern UI/UX and efficient performance, focusing on cognitive search, proactive insights, calendar/email integration, and AI task execution.

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
- **Schema**: `users`, `log_entries`, `settings`, `categories`, `people`, `aiActions`, `aiActionPreferences`, `ai_cache`, `location_history`, `frequent_places` tables.
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

### Core Features & Design Principles
- **AI Processing**: OpenAI GPT for metadata extraction, GPT-4o-mini for query decomposition and action detection, `text-embedding-3-small` for embeddings.
- **Voice Processing**: Browser SpeechRecognition API, OpenAI Whisper API for Telegram voice notes.
- **Hybrid Search**: Combines semantic similarity with structured filters.
- **Application Structure**: Monorepo with shared schema (`/shared`), full TypeScript coverage with Zod validation.
- **Key Capabilities**: AI-powered voice input, manual categorization, hybrid search, real-time feedback, mobile-first design, robust error recovery.
- **Cognitive Search**: Mood tracking, people detection, mood distribution charts.
- **AI Thematic Synthesis**: Dedicated page (/synthesis) for deep pattern analysis with interactive Q&A chat interface. Auto-generates comprehensive analysis on page load, allows follow-up questions about patterns, habits, mood trends, and recommendations. Configurable time period (7 days to 1 year).
- **Ideas Incubator**: Dedicated section (/ideas) for brainstorming and developing ideas through AI conversation. Ideas progress through stages: Spark → Exploring → Planning → In Progress → Completed/Dropped. Features include AI chat for refining ideas, AI-generated task breakdown, manual task management, and stage tracking.
- **Proactive Features**: AI-generated morning briefings, pattern alerts, active projects, contextual discoveries.
- **Personal Insights**: AI-generated insights from user's ecosystem (memories, calendars, emails, finances) displayed on Insights page. Categories: people, projects, calendar, financial, wellbeing, highlights. Cached with 30-minute TTL.
- **Contextual Discoveries**: Uses Tavily AI Search to provide personalized, ad-free content based on user's life insights (upcoming trips, projects, financial patterns). Extracts searchable insights from calendars (next 14 days), emails, memories, and Plaid financial data, then performs contextual searches. Cached with 30-minute TTL. Requires TAVILY_API_KEY configuration. Falls back gracefully if OpenAI API key unavailable for insight extraction.
- **Calendar & Email Integration**: Multi-provider support (Google, Microsoft Outlook) for auto-linking memories to events, smart event detection, and event creation.
- **AI Task Execution**: Detection of actionable requests (calendar, email, reminders) with policy-based approval and rollback capability.
- **Telegram Integration**: Record memories via text/voice notes, account linking, outbound notifications.
- **Meta Glasses Integration**: MCP Protocol 2025-01 compliant payloads, geolocation capture, device context.
- **Location History**: Google Timeline import (supports legacy and semantic JSON formats), automatic location capture from memories, frequent place detection with home/work auto-labeling, location clustering, and location context integrated into AI briefings and insights.

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