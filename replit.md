# MyDigitalMemory (MDM) - Replit Configuration

## Overview
MyDigitalMemory (MDM) is an AI-powered mobile-first voice logging and search system. It allows users to log free-form natural language memories via voice or text, which are then processed by OpenAI GPT to extract topic tags and structured metadata. The system features semantic search using OpenAI embeddings combined with structured filters for powerful hybrid search capabilities. The project aims to provide a robust, production-ready application with a modern UI/UX and efficient performance.

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
- **Environment Validation**: Startup validation for critical environment variables (OPENAI_API_KEY, SESSION_SECRET, DATABASE_URL).

### Database Design
- **Database**: PostgreSQL with Neon serverless deployment.
- **Optimization**: Strategic indexes for performance (timestamp, topic tag, HNSW vector, composite indexes).
- **Schema**: `users`, `log_entries`, `settings` tables.
- **Data Storage**: JSONB for flexible metadata, vector type for embeddings.
- **User Data Isolation**: All data filtered by `userId` with foreign key relationships.

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