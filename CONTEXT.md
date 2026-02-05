# Keryx Architecture Context

> **Purpose**: This document maps the application's architecture, data flow, dependencies, and danger zones. Update this file whenever significant changes are made to maintain sync between development and documentation.

---

## Table of Contents
1. [Folder Structure](#folder-structure)
2. [Data Flow](#data-flow)
3. [Dependency Map](#dependency-map)
4. [Danger Zones](#danger-zones)
5. [External Integrations](#external-integrations)
6. [Change Log](#change-log)

---

## Folder Structure

```
keryx/
├── client/                      # Frontend React application
│   └── src/
│       ├── App.tsx              # Route definitions, auth wrapper
│       ├── main.tsx             # React entry point
│       ├── index.css            # Global styles, Tailwind, theme variables
│       ├── components/          # Reusable UI components
│       │   ├── ui/              # shadcn/ui primitives (Button, Card, Dialog, etc.)
│       │   ├── app-layout.tsx   # Main layout wrapper (sidebar, header) - USED BY ALL PAGES
│       │   ├── mobile-layout.tsx # Mobile-specific layout
│       │   ├── voice-activation.tsx # Voice recording component
│       │   ├── pending-actions.tsx # AI action approval component
│       │   ├── contextual-discoveries.tsx # Tavily-powered discoveries
│       │   ├── personal-insights.tsx # AI insights display
│       │   └── [other components]
│       ├── hooks/               # Custom React hooks
│       │   ├── use-speech-recognition.tsx # Web Speech API wrapper
│       │   ├── use-speech-synthesis.tsx # TTS wrapper
│       │   ├── use-geolocation.tsx # Browser geolocation
│       │   ├── use-toast.ts     # Toast notifications
│       │   └── use-session-category.tsx # Category session state
│       ├── lib/                 # Shared utilities
│       │   ├── queryClient.ts   # TanStack Query config, apiRequest helper
│       │   ├── auth-context.tsx # Authentication state provider
│       │   ├── analytics.ts     # Google Analytics
│       │   └── utils.ts         # cn() and misc utilities
│       ├── pages/               # Route pages
│       │   ├── dashboard.tsx    # Home dashboard with briefing, alerts
│       │   ├── voice-control.tsx # Voice logging page
│       │   ├── history.tsx      # Memory list with search, filters
│       │   ├── insights.tsx     # AI insights page
│       │   ├── synthesis.tsx    # Thematic synthesis chat
│       │   ├── ideas.tsx        # Ideas workspace list
│       │   ├── idea-detail.tsx  # Single idea view
│       │   ├── people.tsx       # People management
│       │   ├── timeline.tsx     # Calendar timeline view
│       │   ├── locations.tsx    # Location history
│       │   ├── settings.tsx     # User settings, integrations
│       │   ├── login.tsx        # Login form
│       │   ├── signup.tsx       # Registration form
│       │   └── landing.tsx      # Public landing page
│       └── types/               # TypeScript type definitions
│           └── speech.ts        # Speech API types
│
├── server/                      # Backend Express application
│   ├── index.ts                 # Express app entry, middleware setup
│   ├── routes.ts                # ALL API routes (~4500 lines) - CENTRAL HUB
│   ├── storage.ts               # Database access layer (IStorage interface)
│   ├── db.ts                    # Drizzle ORM database connection
│   ├── auth.ts                  # Passport.js authentication, requireAuth middleware
│   ├── vite.ts                  # Vite dev server integration
│   │
│   │  # AI Services
│   ├── ai-service.ts            # OpenAI integration (metadata, embeddings, briefings)
│   ├── ai-actions-service.ts    # AI action detection and execution
│   │
│   │  # External Integrations
│   ├── calendar-service.ts      # Google Calendar integration
│   ├── outlook-calendar-service.ts # Outlook Calendar integration
│   ├── gmail-service.ts         # Gmail integration
│   ├── outlook-mail-service.ts  # Outlook Mail integration
│   ├── plaid-service.ts         # Plaid financial integration
│   ├── telegram-service.ts      # Telegram bot integration
│   ├── push-service.ts          # Web push notifications
│   ├── location-service.ts      # Location processing, Google Timeline import
│   ├── contextual-discoveries-service.ts # Tavily AI search
│   └── high-signal-service.ts   # VIP people detection in discoveries
│
├── shared/                      # Shared between client and server
│   ├── schema.ts                # Drizzle ORM schema, Zod schemas, types - CRITICAL FILE
│   └── priority-utils.ts        # People priority/closeness utilities
│
├── companion-app/               # React Native app for Meta Glasses (separate project)
│
├── scripts/                     # Utility scripts
│
├── replit.md                    # Replit-specific documentation
├── CONTEXT.md                   # This file
└── [config files]               # package.json, tsconfig, vite.config, etc.
```

---

## Data Flow

### 1. Memory Creation Flow
```
User Voice/Text Input
        │
        ▼
┌─────────────────────┐
│ VoiceActivation.tsx │ (client)
│ - captures audio    │
│ - transcribes text  │
└────────┬────────────┘
         │ POST /api/memories
         ▼
┌─────────────────────┐
│ routes.ts           │ (server)
│ - validates input   │
│ - calls AI services │
└────────┬────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ai-service│ │ai-actions-   │
│.ts      │ │service.ts    │
│-extract │ │-detect       │
│ metadata│ │ calendar/    │
│-generate│ │ email intents│
│ embedding│└──────────────┘
└────┬────┘
     │
     ▼
┌─────────────────────┐
│ storage.ts          │
│ - createLogEntry()  │
│ - createCategory()  │
│ - updatePerson()    │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ PostgreSQL (Neon)   │
│ - log_entries table │
│ - vector embeddings │
└─────────────────────┘
```

### 2. Search Flow
```
User Search Query
        │
        ▼
┌─────────────────────┐
│ history.tsx         │ (client)
│ - search input      │
└────────┬────────────┘
         │ POST /api/memories/search
         ▼
┌─────────────────────┐
│ routes.ts           │ (server)
└────────┬────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌──────────────┐
│decomposeQuery│ │generateEmbedding│
│(ai-service)  │ │(ai-service)     │
│- extract     │ │- query vector   │
│  filters     │ └────────┬────────┘
└──────┬───────┘          │
       │                  │
       ▼                  ▼
┌─────────────────────────────┐
│ storage.hybridSearch()      │
│ - vector similarity (pgvector)│
│ - structured filters         │
│ - RRF fusion scoring         │
└─────────────────────────────┘
```

### 3. AI Briefing/Insights Flow
```
Dashboard Load / Insights Request
        │
        ▼
┌─────────────────────┐
│ dashboard.tsx       │ (client)
│ or insights.tsx     │
└────────┬────────────┘
         │ GET /api/briefing or POST /api/insights
         ▼
┌─────────────────────┐
│ routes.ts           │ (server)
│ - check ai_cache    │
└────────┬────────────┘
         │ (if not cached)
         ▼
┌─────────────────────────────────────────┐
│ ai-service.ts                           │
│ - getRecentLogEntriesLight() from storage│
│ - fetch calendar events (calendar-service)│
│ - fetch emails (gmail-service)           │
│ - fetch finances (plaid-service)         │
│ - generate briefing via OpenAI           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│ storage.setAiCache()│
│ - 30-min TTL        │
└─────────────────────┘
```

### 4. Authentication Flow
```
Login/Signup Request
        │
        ▼
┌─────────────────────┐
│ login.tsx / signup.tsx │ (client)
└────────┬────────────┘
         │ POST /api/login or /api/register
         ▼
┌─────────────────────┐
│ routes.ts           │
│ - passport.authenticate │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ auth.ts             │
│ - LocalStrategy     │
│ - bcrypt compare    │
│ - session creation  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ PostgreSQL          │
│ - session table     │
│ - users table       │
└─────────────────────┘
```

---

## Dependency Map

### Critical Dependencies (Highest Coupling)

| Source File | Depends On | Impact of Change |
|-------------|------------|------------------|
| **shared/schema.ts** | drizzle-orm, zod | **CRITICAL**: ALL files depend on this. Changes to table schemas, types, or Zod schemas can break: routes.ts, storage.ts, all client pages, all services |
| **server/storage.ts** | shared/schema.ts, db.ts | **HIGH**: All routes depend on storage. Interface changes break routes.ts |
| **server/routes.ts** | ALL server files | **HIGH**: Central hub. 80+ endpoints reference storage, ai-service, all integrations |
| **server/ai-service.ts** | OpenAI SDK | **HIGH**: routes.ts, ai-actions-service.ts depend on exports. Prompt changes affect AI behavior |
| **client/src/lib/queryClient.ts** | tanstack-query | **HIGH**: All pages use useQuery/useMutation with this client |
| **client/src/lib/auth-context.tsx** | - | **HIGH**: All authenticated pages depend on useAuth() |
| **client/src/components/app-layout.tsx** | wouter, auth-context | **HIGH**: All authenticated pages wrap in this layout |

### Server File Dependencies

```
server/routes.ts (CENTRAL HUB)
├── storage.ts (all database operations)
├── ai-service.ts (metadata, embeddings, briefings, insights)
├── ai-actions-service.ts (action detection & execution)
├── auth.ts (requireAuth middleware)
├── calendar-service.ts (Google Calendar)
├── outlook-calendar-service.ts (Outlook Calendar)
├── gmail-service.ts (Gmail)
├── outlook-mail-service.ts (Outlook Mail)
├── plaid-service.ts (financial data)
├── telegram-service.ts (bot webhook)
├── push-service.ts (web push)
├── location-service.ts (location processing)
├── contextual-discoveries-service.ts (Tavily)
└── high-signal-service.ts (VIP detection)

server/storage.ts
├── shared/schema.ts (table definitions, types)
└── db.ts (database connection)

server/ai-service.ts
├── OpenAI SDK
└── (standalone - no internal dependencies)

server/ai-actions-service.ts
├── storage.ts
├── calendar-service.ts
├── outlook-calendar-service.ts
├── gmail-service.ts
├── outlook-mail-service.ts
└── shared/schema.ts

server/contextual-discoveries-service.ts
├── storage.ts
├── calendar-service.ts
├── gmail-service.ts
├── plaid-service.ts
└── high-signal-service.ts
```

### Client File Dependencies

```
client/src/App.tsx (ROUTE DEFINITIONS)
├── lib/auth-context.tsx
├── lib/queryClient.ts
├── components/theme-provider.tsx
└── pages/* (all page components)

client/src/pages/* (ALL PAGES)
├── components/app-layout.tsx (layout wrapper)
├── components/ui/* (shadcn components)
├── lib/queryClient.ts (apiRequest, queryClient)
├── hooks/* (speech, geolocation, toast)
└── @shared/schema (types)

client/src/components/app-layout.tsx
├── components/sidebar.tsx
├── lib/auth-context.tsx
└── wouter (useLocation)

client/src/components/voice-activation.tsx
├── hooks/use-speech-recognition.tsx
├── hooks/use-speech-synthesis.tsx
├── hooks/use-geolocation.tsx
├── lib/queryClient.ts
└── @shared/schema
```

---

## Danger Zones

### 🔴 CRITICAL - High Risk of Breaking Changes

| File | Risk | Before Changing |
|------|------|-----------------|
| **shared/schema.ts** | Breaking table schemas breaks migrations and all dependent code | Run `npm run db:push` after changes. Never change ID column types. Check all files that import types. |
| **server/storage.ts** | Changing IStorage interface breaks routes.ts | Update routes.ts simultaneously. Check for all usages of affected methods. |
| **server/routes.ts** | Endpoint changes break client | Search client for usages: grep `/api/endpoint`. Update client simultaneously. |
| **server/ai-service.ts extractMetadata()** | Changing return shape breaks memory creation | Update routes.ts line ~460 and client expectations. |
| **client/src/lib/queryClient.ts** | Changing apiRequest or queryFn breaks all API calls | Test all pages after changes. |

### 🟠 HIGH - Cascade Effects

| File | Risk | Before Changing |
|------|------|-----------------|
| **server/auth.ts requireAuth** | Removing breaks all protected routes | Ensure all routes have proper auth. |
| **client/src/components/app-layout.tsx** | Layout changes affect ALL pages | Test navigation on all pages. |
| **AI Prompt Changes (ai-service.ts)** | Changes to extractMetadata prompt change AI classification behavior | Test with various memory inputs. May need reprocessing. |
| **server/calendar-service.ts** | Changes break event creation/linking | Test ai-actions-service.ts integration. |

### 🟡 MEDIUM - Integration Dependencies

| File | Risk | Before Changing |
|------|------|-----------------|
| **server/plaid-service.ts** | Changes affect financial features in briefings/insights | Update settings.tsx toggles if adding/removing features. |
| **server/telegram-service.ts** | Webhook format changes break mobile notifications | Test with actual Telegram messages. |
| **server/contextual-discoveries-service.ts** | Changes affect dashboard discoveries | Ensure Tavily API compatibility. |

### Tight Coupling Pairs

These files MUST be updated together:

1. **shared/schema.ts ↔ server/storage.ts**
   - Adding/removing table columns
   - Adding new tables
   - Changing types

2. **server/routes.ts ↔ client pages**
   - Endpoint path changes
   - Request/response body changes
   - New endpoints

3. **server/ai-service.ts ↔ server/routes.ts**
   - Function signature changes
   - Return type changes
   - New AI functions

4. **server/storage.ts ↔ server/routes.ts**
   - New storage methods
   - Changed method signatures
   - Query parameter changes

5. **client/src/lib/auth-context.tsx ↔ client/src/App.tsx**
   - Auth state changes
   - Protected route logic

---

## External Integrations

| Service | Server File | Environment Variables | Features |
|---------|-------------|----------------------|----------|
| **OpenAI** | ai-service.ts | `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY` | Metadata extraction, embeddings, briefings, insights |
| **Google Calendar** | calendar-service.ts | Replit Integration | Event read/write, linking |
| **Outlook Calendar** | outlook-calendar-service.ts | Replit Integration | Event read/write |
| **Gmail** | gmail-service.ts | Replit Integration | Email read for insights |
| **Outlook Mail** | outlook-mail-service.ts | Replit Integration | Email read for insights |
| **Plaid** | plaid-service.ts | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Financial data for insights |
| **Telegram** | telegram-service.ts | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Voice notes, notifications |
| **Tavily** | contextual-discoveries-service.ts | `TAVILY_API_KEY` | Contextual web search |
| **PostgreSQL (Neon)** | db.ts | `DATABASE_URL` | All data storage |

---

## Change Log

| Date | Change | Files Affected |
|------|--------|----------------|
| Feb 5, 2026 | Production cleanup: gated debug logs, fixed type safety (req.user as User), optimized polling (60s vs 5s) | routes.ts, calendar-service.ts, recent-activity.tsx |
| Feb 5, 2026 | Expanded topic categories from 6 to 15 | ai-service.ts (extractMetadata, decomposeQuery prompts), routes.ts (backfill endpoint) |
| Feb 5, 2026 | Created CONTEXT.md | New file |

---

## Quick Reference: Adding New Features

### Adding a New API Endpoint
1. Define route in `server/routes.ts`
2. Add storage methods in `server/storage.ts` if needed
3. Update `shared/schema.ts` if new types needed
4. Create/update client page to call endpoint
5. Update this CONTEXT.md

### Adding a New Database Table
1. Define table in `shared/schema.ts`
2. Add insert schema and types in `shared/schema.ts`
3. Add storage methods in `server/storage.ts`
4. Run `npm run db:push`
5. Add routes in `server/routes.ts`
6. Update this CONTEXT.md

### Adding a New Page
1. Create page component in `client/src/pages/`
2. Add route in `client/src/App.tsx`
3. Add navigation link in `client/src/components/app-layout.tsx`
4. Update this CONTEXT.md

### Modifying AI Behavior
1. Update prompts in `server/ai-service.ts`
2. Consider cache invalidation (ai_cache table)
3. Test with various inputs
4. May need to offer "reprocess all memories" in settings
5. Update replit.md and CONTEXT.md
