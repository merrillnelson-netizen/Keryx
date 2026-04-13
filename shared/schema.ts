import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, json, vector, index, uniqueIndex, real, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * MCP (Model Context Protocol) compliant geolocation schema
 * Used for companion app payloads with rich context
 */
export const geoContextSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  placeName: z.string().optional(),
  accuracyMeters: z.number().optional(),
});

export const deviceContextSchema = z.object({
  id: z.string(),
  type: z.enum(['oakley-hstn', 'meta-glasses', 'phone', 'web']).default('web'),
  connection: z.enum(['bluetooth-hfp', 'bluetooth-a2dp', 'wifi', 'direct']).default('direct'),
});

export const audioContextSchema = z.object({
  scoSessionId: z.string().optional(),
  format: z.enum(['pcm16', 'opus', 'aac']).default('pcm16'),
  sampleRateHz: z.number().default(16000),
  durationMs: z.number().optional(),
});

export const mcpPayloadSchema = z.object({
  type: z.literal('memory.action'),
  schemaVersion: z.string().default('2025-01'),
  action: z.enum(['record', 'query']),
  timestamp: z.string().datetime(),
  geo: geoContextSchema.optional(),
  device: deviceContextSchema.optional(),
  audio: audioContextSchema.optional(),
  transcript: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type GeoContext = z.infer<typeof geoContextSchema>;
export type DeviceContext = z.infer<typeof deviceContextSchema>;
export type AudioContext = z.infer<typeof audioContextSchema>;
export type MCPPayload = z.infer<typeof mcpPayloadSchema>;

/**
 * AI Decision Log schema - stores reasoning for AI decisions
 * Provides transparency about why the AI made certain classifications
 */
export const aiReasoningSchema = z.object({
  topic: z.string().optional(), // Why this topic was chosen
  mood: z.string().optional(), // Why this mood was detected
  people: z.string().optional(), // Why these people were identified
  calendar: z.string().optional(), // Why this calendar event was linked
});

export type AIReasoning = z.infer<typeof aiReasoningSchema>;

/**
 * Users table - authentication and user management
 */
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  subscriptionTier: text("subscription_tier").default('free').notNull(),
  subscriptionStatus: text("subscription_status").default('active').notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  memoriesThisMonth: integer("memories_this_month").default(0).notNull(),
  memoriesMonthStart: timestamp("memories_month_start"),
  earlyAdopterAt: timestamp("early_adopter_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Session table - used by connect-pg-simple for session management
 * This table is managed by the session store, not by Drizzle directly
 */
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

/**
 * Categories table - user-defined memory categories
 * Each user can create custom categories for organizing their memories
 */
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for user-specific category queries
  userIdIdx: index("categories_user_id_idx").on(table.userId),
  // Unique constraint: each user can only have one category with a given name
  uniqueUserCategory: uniqueIndex("categories_user_name_idx").on(table.userId, table.name),
}));

/**
 * Log entries table - stores voice memories with AI-extracted metadata and embeddings
 * Optimized with indexes for:
 * - User isolation (userId)
 * - Chronological retrieval (timestamp)
 * - Topic filtering (topicTag)
 * - Semantic search (embeddingVector with cosine similarity)
 * - Combined filters (userId + timestamp, topicTag + timestamp)
 */
export const logEntries = pgTable("log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  memoryText: text("memory_text").notNull(), // Raw voice-to-text transcription
  topicTag: text("topic_tag").notNull(), // AI-extracted topic (e.g., "Billiards", "Groceries")
  metadataJson: jsonb("metadata_json").notNull(), // AI-extracted structured data
  embeddingVector: vector("embedding_vector", { dimensions: 1536 }), // OpenAI text-embedding-3-small creates 1536-dim vectors
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  // Phase 1: Cognitive features
  mood: text("mood"), // AI-detected mood: happy, sad, anxious, excited, neutral, frustrated, hopeful, etc.
  moodScore: integer("mood_score"), // Sentiment score: -100 (very negative) to +100 (very positive)
  detectedPeople: text("detected_people").array(), // Array of person names detected in the memory
  // Phase 3: Geolocation context from companion app
  geoLat: real("geo_lat"), // Latitude coordinate
  geoLng: real("geo_lng"), // Longitude coordinate
  geoPlaceId: text("geo_place_id"), // Google Places ID for reverse lookup
  geoPlaceName: text("geo_place_name"), // Semantic place name (e.g., "Main St. Billiards Hall")
  geoAccuracyMeters: real("geo_accuracy_meters"), // GPS accuracy in meters
  // Device context from companion app
  deviceId: text("device_id"), // Device identifier
  deviceType: text("device_type"), // 'oakley-hstn', 'meta-glasses', 'phone', 'web'
  deviceConnection: text("device_connection"), // 'bluetooth-hfp', 'bluetooth-a2dp', 'wifi', 'direct'
  // Calendar integration: linked event data
  calendarEventId: text("calendar_event_id"), // Google Calendar event ID
  calendarEventTitle: text("calendar_event_title"), // Meeting title from calendar
  calendarEventAttendees: text("calendar_event_attendees").array(), // Attendee names/emails
  // AI Decision Log: transparency about AI reasoning
  aiReasoning: jsonb("ai_reasoning"), // { topic: string, mood: string, people: string, calendar?: string }
  // Importance level: 1-10 scale, AI-assigned initially, user-adjustable
  // Higher importance = more weight in AI analysis (briefings, insights, synthesis)
  importance: integer("importance").default(5), // 1 = lowest, 5 = middle, 10 = highest
}, (table) => ({
  // Index for user-specific queries (critical for data isolation)
  userIdIdx: index("log_entries_user_id_idx").on(table.userId),
  
  // Index for chronological queries (recent memories)
  timestampIdx: index("log_entries_timestamp_idx").on(table.timestamp.desc()),
  
  // Index for topic-based filtering
  topicTagIdx: index("log_entries_topic_tag_idx").on(table.topicTag),
  
  // Vector index for semantic similarity search using cosine distance
  // This enables fast nearest-neighbor search for embeddings
  embeddingIdx: index("log_entries_embedding_idx").using(
    "hnsw",
    table.embeddingVector.op("vector_cosine_ops")
  ),
  
  // Composite index for common query: user's memories sorted by time
  userTimestampIdx: index("log_entries_user_timestamp_idx").on(
    table.userId,
    table.timestamp.desc()
  ),
  
  // Composite index for common query: filter by topic and sort by time
  topicTimestampIdx: index("log_entries_topic_timestamp_idx").on(
    table.topicTag,
    table.timestamp.desc()
  ),
  
  // Index for mood-based analytics queries
  userMoodIdx: index("log_entries_user_mood_idx").on(
    table.userId,
    table.mood
  ),
  
  // Index for calendar-linked memory queries
  userCalendarIdx: index("log_entries_user_calendar_idx").on(
    table.userId,
    table.calendarEventId
  ),
}));

/**
 * People table - tracks people mentioned across memories
 * Enables building relationship graphs and context about connections
 */
export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  phoneNumber: text("phone_number"),
  relationship: text("relationship"),
  notes: text("notes"),
  aliases: text("aliases").array().default(sql`'{}'::text[]`),
  priority: integer("priority").default(5).notNull(),
  mentionCount: integer("mention_count").default(0),
  source: text("source").default("memory").notNull(),
  firstMentioned: timestamp("first_mentioned").defaultNow().notNull(),
  lastMentioned: timestamp("last_mentioned").defaultNow().notNull(),
  recentMentionCount: integer("recent_mention_count").default(0),
  velocityTier: text("velocity_tier").default("acquaintance"),
  previousVelocityTier: text("previous_velocity_tier"),
}, (table) => ({
  userIdIdx: index("people_user_id_idx").on(table.userId),
  uniqueUserPerson: uniqueIndex("people_user_name_idx").on(table.userId, table.name),
  priorityIdx: index("people_priority_idx").on(table.userId, table.priority),
  phoneIdx: index("people_phone_idx").on(table.userId, table.phoneNumber),
}));

/**
 * Settings table - application configuration
 * Supports multi-provider preferences for calendar and email services
 */
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  voiceResponseEnabled: boolean("voice_response_enabled").default(true),
  confidenceThreshold: integer("confidence_threshold").default(80), // 0-100
  // Calendar provider settings
  calendarProvider: text("calendar_provider"), // 'google' or 'outlook' - default provider for calendar operations
  calendarAutoLink: boolean("calendar_auto_link").default(true), // Auto-link memories to calendar events
  googleCalendarEnabled: boolean("google_calendar_enabled").default(true), // Enable/disable Google Calendar integration
  outlookCalendarEnabled: boolean("outlook_calendar_enabled").default(true), // Enable/disable Outlook Calendar integration
  // Email provider settings
  emailProvider: text("email_provider"), // 'gmail' or 'outlook' - default provider for email operations
  emailIntegrationEnabled: boolean("email_integration_enabled").default(true), // Master toggle for email features
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(false), // Send email summaries/reminders
  gmailEnabled: boolean("gmail_enabled").default(true), // Enable/disable Gmail integration
  outlookMailEnabled: boolean("outlook_mail_enabled").default(true), // Enable/disable Outlook Mail integration
  // Provider selection mode: 'default' uses settings, 'ask' prompts per-memory
  providerSelectionMode: text("provider_selection_mode").default("default"), // 'default' or 'ask'
  // Active projects: topics marked as current focus for higher relevance weighting
  activeProjects: text("active_projects").array(), // Array of topic names marked as active focus areas
  // Plaid/Financial integration settings
  plaidEnabled: boolean("plaid_enabled").default(false), // Master toggle for financial features
  plaidIncludeInBriefings: boolean("plaid_include_in_briefings").default(true), // Include spending insights in morning briefings
  plaidTransactionDaysToShow: integer("plaid_transaction_days_to_show").default(7), // Days of transactions to display
  userTimezone: text("user_timezone").default("America/Denver"), // IANA timezone (e.g., 'America/Denver')
  // AI Personality settings (Sass-o-Meter)
  sassLevel: integer("sass_level").default(50), // 0-100: controls Keryx persona intensity
  professionalMode: boolean("professional_mode").default(false), // Overrides sassLevel to muted/professional mode
  // Relay API
  relayApiKey: text("relay_api_key"), // Static API key for inbound relay endpoint (no session required)
  // Action Chaining
  allowActionChaining: boolean("allow_action_chaining").default(true), // Allow agent to spawn follow-up child actions after successful completion
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("settings_user_id_idx").on(table.userId),
}));

/**
 * AI Actions table - tracks AI-proposed and executed actions
 * Enables AI to perform tasks on behalf of users with approval workflows
 */
export const aiActions = pgTable("ai_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Action classification
  actionType: text("action_type").notNull(), // 'calendar.create', 'calendar.delete', 'email.send', 'email.reply', 'reminder.create'
  actionCategory: text("action_category").notNull(), // 'calendar', 'email', 'reminder', 'people'
  // Source context - what triggered this action
  sourceType: text("source_type").notNull(), // 'voice_input', 'memory', 'briefing', 'manual'
  sourceId: varchar("source_id"), // Reference to log_entry.id or other source
  sourceText: text("source_text"), // The user input that triggered this action
  // Action details
  title: text("title").notNull(), // Human-readable title: "Schedule meeting with John"
  description: text("description"), // Detailed description of what will happen
  payload: jsonb("payload").notNull(), // Action-specific data (event details, email content, etc.)
  // Execution state
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'rejected', 'executing', 'completed', 'failed', 'cancelled'
  // AI reasoning for transparency
  aiReasoning: text("ai_reasoning"), // Why the AI proposed this action
  confidence: real("confidence"), // 0.0-1.0 confidence score
  // Execution results
  executedAt: timestamp("executed_at"),
  resultData: jsonb("result_data"), // Response from the external service (created event ID, sent email ID, etc.)
  errorMessage: text("error_message"), // Error details if failed
  // Rollback capability
  rollbackAvailable: boolean("rollback_available").default(false),
  rollbackData: jsonb("rollback_data"), // Data needed to undo this action
  rolledBackAt: timestamp("rolled_back_at"),
  // Action chaining — linked parent action for sequential workflows
  parentActionId: varchar("parent_action_id"), // FK to ai_actions.id (self-referential, nullable)
  chainDepth: integer("chain_depth").default(0), // 0 = root, max 3 hops
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Auto-reject after this time if not approved
}, (table) => ({
  userIdIdx: index("ai_actions_user_id_idx").on(table.userId),
  statusIdx: index("ai_actions_status_idx").on(table.status),
  userStatusIdx: index("ai_actions_user_status_idx").on(table.userId, table.status),
  createdAtIdx: index("ai_actions_created_at_idx").on(table.createdAt),
}));

/**
 * AI Action Preferences - per-user settings for how AI should handle different action types
 */
export const aiActionPreferences = pgTable("ai_action_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  actionType: text("action_type").notNull(), // 'calendar.create', 'email.send', etc.
  // Policy: how to handle this action type
  policy: text("policy").notNull().default("confirm"), // 'auto' (execute immediately), 'confirm' (require approval), 'disabled' (never execute)
  // Additional constraints
  autoApproveConditions: jsonb("auto_approve_conditions"), // e.g., { maxDurationMinutes: 60, allowedRecipients: ['team@...'] }
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userActionTypeIdx: uniqueIndex("ai_action_prefs_user_action_idx").on(table.userId, table.actionType),
}));

/**
 * AI Cache table - stores pre-generated AI content for performance
 * Caches briefings, alerts, and insights to avoid regenerating on every request
 */
export const aiCache = pgTable("ai_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  cacheType: text("cache_type").notNull(), // 'briefing', 'alerts', 'insights', 'thematic'
  cacheKey: text("cache_key").notNull(), // Additional key (e.g., date for briefing, topic for insights)
  data: jsonb("data").notNull(), // The cached AI response
  memoriesHash: text("memories_hash"), // Hash of memory IDs used to generate this cache
  memoriesCount: integer("memories_count"), // Number of memories analyzed
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // When this cache becomes stale
}, (table) => ({
  userTypeKeyIdx: uniqueIndex("ai_cache_user_type_key_idx").on(table.userId, table.cacheType, table.cacheKey),
  expiresAtIdx: index("ai_cache_expires_at_idx").on(table.expiresAt),
  userIdFk: foreignKey({
    name: "ai_cache_user_id_fkey",
    columns: [table.userId],
    foreignColumns: [users.id],
  }).onDelete("cascade"),
}));

/**
 * Plaid Items table - stores connected financial institutions
 * Each item represents a connection to one financial institution via Plaid
 */
export const plaidItems = pgTable("plaid_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  itemId: text("item_id").notNull().unique(), // Plaid's item_id
  accessToken: text("access_token").notNull(), // Encrypted Plaid access_token
  institutionId: text("institution_id"), // Plaid institution ID
  institutionName: text("institution_name"), // Human-readable institution name
  status: text("status").notNull().default("active"), // 'active', 'needs_reauth', 'removed'
  lastSyncedAt: timestamp("last_synced_at"),
  cursor: text("cursor"), // Plaid sync cursor for incremental transaction updates
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("plaid_items_user_id_idx").on(table.userId),
}));

/**
 * Financial Accounts table - stores individual bank accounts from Plaid
 * Each Plaid item can have multiple accounts (checking, savings, credit cards, etc.)
 */
export const financialAccounts = pgTable("financial_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  plaidItemId: varchar("plaid_item_id").notNull().references(() => plaidItems.id, { onDelete: 'cascade' }),
  accountId: text("account_id").notNull().unique(), // Plaid's account_id
  name: text("name").notNull(), // Account name from institution
  officialName: text("official_name"), // Official account name
  type: text("type").notNull(), // 'depository', 'credit', 'loan', 'investment', etc.
  subtype: text("subtype"), // 'checking', 'savings', 'credit card', etc.
  mask: text("mask"), // Last 4 digits of account number
  currentBalance: real("current_balance"),
  availableBalance: real("available_balance"),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  isHidden: boolean("is_hidden").default(false), // User can hide accounts they don't want to track
  lastBalanceUpdate: timestamp("last_balance_update"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("financial_accounts_user_id_idx").on(table.userId),
  plaidItemIdIdx: index("financial_accounts_plaid_item_idx").on(table.plaidItemId),
}));

/**
 * Financial Transactions table - stores transaction data from Plaid
 * Transactions are synced incrementally using Plaid's sync endpoint
 */
export const financialTransactions = pgTable("financial_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: varchar("account_id").notNull().references(() => financialAccounts.id, { onDelete: 'cascade' }),
  transactionId: text("transaction_id").notNull().unique(), // Plaid's transaction_id
  amount: real("amount").notNull(), // Positive for debits, negative for credits
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  date: timestamp("date").notNull(), // Transaction date
  name: text("name").notNull(), // Merchant name or description
  merchantName: text("merchant_name"), // Cleaned merchant name
  category: text("category").array(), // Plaid category hierarchy
  primaryCategory: text("primary_category"), // Primary category for simpler filtering
  pending: boolean("pending").default(false),
  // Additional metadata
  paymentChannel: text("payment_channel"), // 'online', 'in store', 'other'
  location: jsonb("location"), // Store location if available
  // For linking transactions to memories
  linkedMemoryId: varchar("linked_memory_id").references(() => logEntries.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("financial_transactions_user_id_idx").on(table.userId),
  accountIdIdx: index("financial_transactions_account_idx").on(table.accountId),
  dateIdx: index("financial_transactions_date_idx").on(table.date.desc()),
  userDateIdx: index("financial_transactions_user_date_idx").on(table.userId, table.date.desc()),
  categoryIdx: index("financial_transactions_category_idx").on(table.primaryCategory),
  linkedMemoryIdIdx: index("financial_transactions_linked_memory_idx").on(table.linkedMemoryId),
}));

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertLogEntrySchema = createInsertSchema(logEntries).omit({
  id: true,
  timestamp: true,
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertPersonSchema = createInsertSchema(people).omit({
  id: true,
  userId: true,
  mentionCount: true,
  firstMentioned: true,
  lastMentioned: true,
});

export const insertAiActionSchema = createInsertSchema(aiActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  executedAt: true,
  rolledBackAt: true,
});

export const insertAiActionPreferenceSchema = createInsertSchema(aiActionPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// TypeScript types inferred from schemas
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntries.$inferSelect;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

export type InsertAiAction = z.infer<typeof insertAiActionSchema>;
export type AiAction = typeof aiActions.$inferSelect;

export type InsertAiActionPreference = z.infer<typeof insertAiActionPreferenceSchema>;
export type AiActionPreference = typeof aiActionPreferences.$inferSelect;

export type AiCache = typeof aiCache.$inferSelect;

// Plaid/Financial types
export const insertPlaidItemSchema = createInsertSchema(plaidItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialAccountSchema = createInsertSchema(financialAccounts).omit({
  id: true,
  createdAt: true,
});

export const insertFinancialTransactionSchema = createInsertSchema(financialTransactions).omit({
  id: true,
  createdAt: true,
});

export type InsertPlaidItem = z.infer<typeof insertPlaidItemSchema>;
export type PlaidItem = typeof plaidItems.$inferSelect;

export type InsertFinancialAccount = z.infer<typeof insertFinancialAccountSchema>;
export type FinancialAccount = typeof financialAccounts.$inferSelect;

export type InsertFinancialTransaction = z.infer<typeof insertFinancialTransactionSchema>;
export type FinancialTransaction = typeof financialTransactions.$inferSelect;

// Cache type constants
export const AI_CACHE_TYPES = {
  BRIEFING: 'briefing',
  ALERTS: 'alerts',
  INSIGHTS: 'insights',
  THEMATIC: 'thematic',
} as const;

// Action type constants for type safety
export const AI_ACTION_TYPES = {
  // Calendar
  CALENDAR_CREATE: 'calendar.create',
  CALENDAR_UPDATE: 'calendar.update',
  CALENDAR_DELETE: 'calendar.delete',
  // Email
  EMAIL_SEND: 'email.send',
  EMAIL_REPLY: 'email.reply',
  EMAIL_DRAFT: 'email.draft',
  // Reminders
  REMINDER_CREATE: 'reminder.create',
  // People / Relationship
  PERSON_UPDATE: 'person.update',
  PEOPLE_REACH_OUT: 'people.reach_out',   // Suggest contacting someone
  PEOPLE_NOTE: 'people.note',             // Add a note to a person's record
  PERSON_DECAY_AUDIT: 'person_decay_audit', // Velocity-decay advisory (pre-existing)
  // Goals
  GOAL_UPDATE: 'goal.update',             // Update goal progress based on evidence
  GOAL_MILESTONE: 'goal.milestone',       // Suggest adding/completing a milestone
  // Web / Research
  WEB_SEARCH: 'web.search',              // Perform a Tavily web search and surface results
  // Memory
  MEMORY_CREATE: 'memory.create',        // Create a new memory/log entry on behalf of the user
  // Financial
  FINANCIAL_ALERT: 'financial.alert',    // Surface a financial pattern or alert (advisory)
  // System / Proactive
  INSIGHT_SURFACE: 'insight.surface',     // Surface a curated insight card
  // Relay / Outbound
  RELAY_OUTBOUND: 'relay.outbound',       // Send content via outbound relay
  // Chaining
  CHAIN_SEQUENCE: 'chain.sequence',       // Multi-step action chain
} as const;

export const AI_ACTION_CATEGORIES = {
  CALENDAR: 'calendar',
  EMAIL: 'email',
  REMINDER: 'reminder',
  PEOPLE: 'people',
  GOALS: 'goals',
  RESEARCH: 'research',
  MEMORY: 'memory',
  FINANCIAL: 'financial',
  SYSTEM: 'system',
  RELAY: 'relay',
} as const;

export const AI_ACTION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const AI_ACTION_POLICIES = {
  AUTO: 'auto',
  CONFIRM: 'confirm',
  DISABLED: 'disabled',
} as const;

// Payload schemas for different action types
export const calendarCreatePayloadSchema = z.object({
  summary: z.string(),
  description: z.string().optional(),
  startDateTime: z.string(), // ISO datetime
  endDateTime: z.string(), // ISO datetime
  attendees: z.array(z.string()).optional(), // Email addresses
  location: z.string().optional(),
  provider: z.enum(['google', 'outlook']).optional(),
  timezone: z.string().optional(), // IANA timezone (e.g., 'America/New_York')
});

export const emailSendPayloadSchema = z.object({
  to: z.array(z.string()), // Email addresses
  subject: z.string(),
  body: z.string(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  provider: z.enum(['gmail', 'outlook']).optional(),
});

export const reminderCreatePayloadSchema = z.object({
  title: z.string(),
  dueDateTime: z.string(), // ISO datetime
  notes: z.string().optional(),
});

export const peopleNotePayloadSchema = z.object({
  personName: z.string(),          // Name to match against contacts
  note: z.string(),                // The note content to add
  personId: z.string().optional(), // Pre-resolved person ID if available
});

export const webSearchPayloadSchema = z.object({
  query: z.string(),               // The search query to run
  context: z.string().optional(),  // Why this search was triggered
  maxResults: z.number().int().min(1).max(5).optional().default(3),
});

export const memoryCreatePayloadSchema = z.object({
  memoryText: z.string(),          // The memory content to log
  topicTag: z.string().optional(), // Optional category tag
  mood: z.string().optional(),     // Optional mood
});

export const financialAlertPayloadSchema = z.object({
  alertType: z.enum(['spending_spike', 'recurring_charge', 'budget_threshold', 'unusual_pattern', 'insight']),
  title: z.string(),               // Short alert headline
  details: z.string(),             // Explanation of the alert
  amount: z.number().optional(),   // Relevant amount if applicable
  merchant: z.string().optional(), // Merchant name if applicable
  category: z.string().optional(), // Spending category if applicable
});

export const goalUpdatePayloadSchema = z.object({
  goalId: z.string().optional(),   // ID of the goal to update (optional; fallback is fuzzy title match)
  goalTitle: z.string(),           // Title of the goal (for display / fuzzy matching)
  newProgress: z.number().int().min(0).max(100), // New progress percent (0-100)
  currentProgress: z.number().int().min(0).max(100).optional(), // Previous progress
  progressNote: z.string().optional(), // Optional note about the progress update
});

export type CalendarCreatePayload = z.infer<typeof calendarCreatePayloadSchema>;
export type EmailSendPayload = z.infer<typeof emailSendPayloadSchema>;
export type ReminderCreatePayload = z.infer<typeof reminderCreatePayloadSchema>;
export type PeopleNotePayload = z.infer<typeof peopleNotePayloadSchema>;
export type WebSearchPayload = z.infer<typeof webSearchPayloadSchema>;
export type MemoryCreatePayload = z.infer<typeof memoryCreatePayloadSchema>;
export type FinancialAlertPayload = z.infer<typeof financialAlertPayloadSchema>;
export type GoalUpdatePayload = z.infer<typeof goalUpdatePayloadSchema>;

/**
 * Ideas table - stores user ideas at various stages of development
 * Ideas progress through stages: spark → exploring → planning → in_progress → completed/dropped
 */
export const IDEA_STAGES = {
  SPARK: 'spark',
  EXPLORING: 'exploring',
  PLANNING: 'planning',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  DROPPED: 'dropped',
} as const;

/**
 * Idea types enum - defines what kind of item this is
 * - idea: Full idea incubation with stages, AI chat, task breakdown
 * - note: Simple text note, no stages
 * - list: Checkable items (grocery list, packing list, etc.)
 * - document: Structured content with sections
 */
export const ideaTypeEnum = z.enum(['idea', 'note', 'list', 'document']);
export type IdeaType = z.infer<typeof ideaTypeEnum>;

/**
 * List item schema for checklist-type ideas
 */
export const listItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  isChecked: z.boolean().default(false),
  order: z.number().default(0),
});
export type ListItem = z.infer<typeof listItemSchema>;

export const ideas = pgTable("ideas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default('idea'), // 'idea' | 'note' | 'list' | 'document'
  stage: text("stage").notNull().default('spark'), // Only used for type='idea'
  chatHistory: jsonb("chat_history").default([]), // Array of { role: 'user'|'assistant', content: string, timestamp: string }
  content: text("content"), // Rich text content for notes/documents
  listItems: jsonb("list_items").default([]), // Array of { id, text, isChecked, order } for lists
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("ideas_user_id_idx").on(table.userId),
  stageIdx: index("ideas_stage_idx").on(table.stage),
  userStageIdx: index("ideas_user_stage_idx").on(table.userId, table.stage),
  typeIdx: index("ideas_type_idx").on(table.type),
  userTypeIdx: index("ideas_user_type_idx").on(table.userId, table.type),
}));

export const ideasRelations = relations(ideas, ({ one, many }) => ({
  user: one(users, {
    fields: [ideas.userId],
    references: [users.id],
  }),
  tasks: many(ideaTasks),
}));

/**
 * Idea Tasks table - stores tasks/steps to bring an idea to reality
 */
export const ideaTasks = pgTable("idea_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ideaId: varchar("idea_id").notNull().references(() => ideas.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").default(false).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ideaIdIdx: index("idea_tasks_idea_id_idx").on(table.ideaId),
  orderIdx: index("idea_tasks_order_idx").on(table.ideaId, table.order),
}));

export const ideaTasksRelations = relations(ideaTasks, ({ one }) => ({
  idea: one(ideas, {
    fields: [ideaTasks.ideaId],
    references: [ideas.id],
  }),
}));

// Ideas schemas and types
export const insertIdeaSchema = createInsertSchema(ideas).omit({
  id: true,
  userId: true,
  chatHistory: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  type: ideaTypeEnum.optional().default('idea'),
  listItems: z.array(listItemSchema).optional(),
});

export const insertIdeaTaskSchema = createInsertSchema(ideaTasks).omit({
  id: true,
  createdAt: true,
});

export type Idea = typeof ideas.$inferSelect;
export type InsertIdea = z.infer<typeof insertIdeaSchema>;
export type IdeaTask = typeof ideaTasks.$inferSelect;
export type InsertIdeaTask = z.infer<typeof insertIdeaTaskSchema>;

export const ideaChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
});

export type IdeaChatMessage = z.infer<typeof ideaChatMessageSchema>;

/**
 * Location History table - stores imported Google Timeline and captured location data
 * Used to enrich AI briefings and insights with location context and patterns
 */
export const locationHistory = pgTable("location_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Core location data
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  // Place information
  placeId: text("place_id"), // Google Place ID
  placeName: text("place_name"), // Semantic name (e.g., "Starbucks", "Home", "Office")
  address: text("address"), // Full address if available
  placeType: text("place_type"), // Google place type or custom: 'home', 'work', 'restaurant', 'gym', etc.
  // Source and accuracy
  source: text("source").notNull().default('google_takeout'), // 'google_takeout', 'memory', 'manual'
  accuracyMeters: real("accuracy_meters"), // GPS accuracy
  // Duration for place visits (from Google Timeline activity segments)
  durationMinutes: integer("duration_minutes"), // How long spent at this location
  // Activity type from Google Timeline
  activityType: text("activity_type"), // 'STILL', 'WALKING', 'IN_VEHICLE', 'ON_BICYCLE', etc.
  confidence: integer("confidence"), // Confidence score 0-100
  // Import batch tracking
  importBatchId: text("import_batch_id"), // Groups locations from same import
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("location_history_user_id_idx").on(table.userId),
  timestampIdx: index("location_history_timestamp_idx").on(table.timestamp.desc()),
  userTimestampIdx: index("location_history_user_timestamp_idx").on(table.userId, table.timestamp.desc()),
  placeNameIdx: index("location_history_place_name_idx").on(table.placeName),
  importBatchIdx: index("location_history_import_batch_idx").on(table.importBatchId),
}));

export const locationHistoryRelations = relations(locationHistory, ({ one }) => ({
  user: one(users, {
    fields: [locationHistory.userId],
    references: [users.id],
  }),
}));

/**
 * Frequent Places table - stores detected patterns like home, work, favorite spots
 * Derived from location_history analysis
 */
export const frequentPlaces = pgTable("frequent_places", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Place identification
  name: text("name").notNull(), // User-defined or AI-detected name
  label: text("label"), // 'home', 'work', 'gym', 'favorite_restaurant', etc.
  // Center coordinates (average of visits)
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  radiusMeters: real("radius_meters").default(100), // Detection radius
  // Place details
  placeId: text("place_id"), // Google Place ID if known
  address: text("address"),
  category: text("category"), // 'residential', 'workplace', 'food_drink', 'fitness', 'entertainment', etc.
  // Visit statistics
  visitCount: integer("visit_count").default(0),
  totalTimeMinutes: integer("total_time_minutes").default(0),
  averageVisitMinutes: integer("average_visit_minutes"),
  lastVisit: timestamp("last_visit"),
  firstVisit: timestamp("first_visit"),
  // Typical visit patterns
  typicalDays: text("typical_days").array(), // ['monday', 'wednesday', 'friday']
  typicalTimeRange: text("typical_time_range"), // '08:00-17:00' for work, '06:00-07:00' for gym
  // User confirmation
  isConfirmed: boolean("is_confirmed").default(false), // User has confirmed this place
  isHidden: boolean("is_hidden").default(false), // User doesn't want this shown
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("frequent_places_user_id_idx").on(table.userId),
  labelIdx: index("frequent_places_label_idx").on(table.label),
  userLabelIdx: uniqueIndex("frequent_places_user_label_idx").on(table.userId, table.label),
}));

export const frequentPlacesRelations = relations(frequentPlaces, ({ one }) => ({
  user: one(users, {
    fields: [frequentPlaces.userId],
    references: [users.id],
  }),
}));

// Location History schemas and types
export const insertLocationHistorySchema = createInsertSchema(locationHistory).omit({
  id: true,
  createdAt: true,
});

export const insertFrequentPlaceSchema = createInsertSchema(frequentPlaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LocationHistory = typeof locationHistory.$inferSelect;
export type InsertLocationHistory = z.infer<typeof insertLocationHistorySchema>;
export type FrequentPlace = typeof frequentPlaces.$inferSelect;
export type InsertFrequentPlace = z.infer<typeof insertFrequentPlaceSchema>;

/**
 * Push Subscriptions table - stores Web Push API subscriptions for notifications
 * Each user can have multiple subscriptions (different devices/browsers)
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(), // Public key for encryption
  auth: text("auth").notNull(), // Auth secret for encryption
  userAgent: text("user_agent"), // Browser/device info for identification
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsed: timestamp("last_used"), // Track when last notification was sent
}, (table) => ({
  userIdIdx: index("push_subscriptions_user_id_idx").on(table.userId),
  endpointIdx: uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
  lastUsed: true,
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

/**
 * Goals table - tracks user goals with AI-driven progress monitoring
 * AI analyzes memories to detect progress and provides suggestions
 */
export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  targetDate: timestamp("target_date"), // Optional deadline
  progressPercent: integer("progress_percent").default(0).notNull(), // 0-100
  status: text("status").notNull().default('active'), // 'active', 'completed', 'paused', 'abandoned'
  milestones: jsonb("milestones").default([]), // Array of { id, title, isCompleted, completedAt, order }
  aiSummary: text("ai_summary"), // AI-generated progress summary
  aiLastAnalyzed: timestamp("ai_last_analyzed"), // When AI last analyzed progress
  relatedMemoryIds: text("related_memory_ids").array(), // IDs of memories that contributed to progress
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("goals_user_id_idx").on(table.userId),
  statusIdx: index("goals_status_idx").on(table.status),
  userStatusIdx: index("goals_user_status_idx").on(table.userId, table.status),
  targetDateIdx: index("goals_target_date_idx").on(table.targetDate),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, {
    fields: [goals.userId],
    references: [users.id],
  }),
}));

// Goal milestone schema for validation
export const goalMilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  isCompleted: z.boolean().default(false),
  completedAt: z.string().optional(),
  order: z.number(),
});

export type GoalMilestone = z.infer<typeof goalMilestoneSchema>;

export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  aiSummary: true,
  aiLastAnalyzed: true,
  relatedMemoryIds: true,
});

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;

/**
 * Reminders table - stores user reminders with time or location triggers
 * Supports:
 * - Time-based: "remind me tomorrow at 3pm"
 * - Location-based: "remind me when I'm at the gym"
 * - Relative time: "remind me in 2 hours"
 */
export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Reminder content
  content: text("content").notNull(), // What to remind about
  // Trigger type
  triggerType: text("trigger_type").notNull(), // 'time' | 'location'
  // Time-based trigger
  triggerTime: timestamp("trigger_time"), // When to trigger (for time-based)
  // Location-based trigger
  triggerLocationName: text("trigger_location_name"), // Place name to match (e.g., "gym", "grocery store")
  triggerLocationId: varchar("trigger_location_id").references(() => frequentPlaces.id), // Optional link to frequent place
  // Status tracking
  status: text("status").notNull().default('pending'), // 'pending', 'triggered', 'completed', 'snoozed', 'dismissed'
  // Snooze support
  snoozedUntil: timestamp("snoozed_until"), // If snoozed, when to remind again
  snoozeCount: integer("snooze_count").default(0), // Track how many times snoozed
  // Source tracking
  sourceMemoryId: varchar("source_memory_id").references(() => logEntries.id, { onDelete: 'set null' }), // Memory that created this reminder
  // Timestamps
  triggeredAt: timestamp("triggered_at"), // When the reminder was triggered
  completedAt: timestamp("completed_at"), // When marked complete
  advanceNotifiedAt: timestamp("advance_notified_at"), // When the 30-min advance push was sent (prevents duplicates)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("reminders_user_id_idx").on(table.userId),
  statusIdx: index("reminders_status_idx").on(table.status),
  userStatusIdx: index("reminders_user_status_idx").on(table.userId, table.status),
  triggerTimeIdx: index("reminders_trigger_time_idx").on(table.triggerTime),
  triggerTypeIdx: index("reminders_trigger_type_idx").on(table.triggerType),
  sourceMemoryIdIdx: index("reminders_source_memory_id_idx").on(table.sourceMemoryId),
  triggerLocationIdIdx: index("reminders_trigger_location_id_idx").on(table.triggerLocationId),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  user: one(users, {
    fields: [reminders.userId],
    references: [users.id],
  }),
  sourceMemory: one(logEntries, {
    fields: [reminders.sourceMemoryId],
    references: [logEntries.id],
  }),
  triggerLocation: one(frequentPlaces, {
    fields: [reminders.triggerLocationId],
    references: [frequentPlaces.id],
  }),
}));

// Reminder insert schema
export const insertReminderSchema = createInsertSchema(reminders).omit({
  id: true,
  userId: true,
  status: true,
  snoozedUntil: true,
  snoozeCount: true,
  triggeredAt: true,
  completedAt: true,
  advanceNotifiedAt: true,
  createdAt: true,
});

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;

/**
 * Message Conversations table - groups messages by contact/thread
 * Source-agnostic: works with SMS Import/Export, Beeper Matrix, or future sources
 */
export const messageConversations = pgTable("message_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  contactAddress: text("contact_address").notNull(),
  contactName: text("contact_name"),
  platform: text("platform").notNull().default('sms'),
  threadId: text("thread_id"),
  lastMessageAt: timestamp("last_message_at"),
  messageCount: integer("message_count").default(0),
  unprocessedCount: integer("unprocessed_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("msg_conv_user_id_idx").on(table.userId),
  userContactIdx: uniqueIndex("msg_conv_user_contact_platform_idx").on(table.userId, table.contactAddress, table.platform),
  lastMessageIdx: index("msg_conv_last_message_idx").on(table.lastMessageAt),
}));

export const messageConversationsRelations = relations(messageConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [messageConversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

/**
 * Messages table - individual messages within conversations
 * Stores both SMS export data and Beeper Matrix data
 */
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull().references(() => messageConversations.id, { onDelete: 'cascade' }),
  externalId: text("external_id"),
  source: text("source").notNull().default('sms_import'),
  direction: text("direction").notNull(),
  senderAddress: text("sender_address"),
  senderName: text("sender_name"),
  body: text("body"),
  messageType: text("message_type").notNull().default('sms'),
  timestamp: timestamp("timestamp").notNull(),
  topicTag: text("topic_tag"),
  detectedPeople: text("detected_people").array(),
  mood: text("mood"),
  moodScore: real("mood_score"),
  importance: integer("importance").default(5),
  aiProcessed: boolean("ai_processed").default(false),
  embeddingVector: vector("embedding_vector", { dimensions: 1536 }),
  importBatchId: text("import_batch_id"),
  rawMetadata: jsonb("raw_metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("messages_user_id_idx").on(table.userId),
  conversationIdx: index("messages_conversation_id_idx").on(table.conversationId),
  timestampIdx: index("messages_timestamp_idx").on(table.timestamp),
  externalIdIdx: index("messages_external_id_idx").on(table.externalId),
  aiProcessedIdx: index("messages_ai_processed_idx").on(table.aiProcessed),
  userTimestampIdx: index("messages_user_timestamp_idx").on(table.userId, table.timestamp),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  conversation: one(messageConversations, {
    fields: [messages.conversationId],
    references: [messageConversations.id],
  }),
}));

/**
 * Message Import History table - tracks import batches for deduplication and management
 */
export const messageImports = pgTable("message_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  batchId: text("batch_id").notNull(),
  source: text("source").notNull().default('sms_import'),
  fileName: text("file_name"),
  totalMessages: integer("total_messages").default(0),
  newMessages: integer("new_messages").default(0),
  duplicateMessages: integer("duplicate_messages").default(0),
  aiProcessedCount: integer("ai_processed_count").default(0),
  status: text("status").notNull().default('processing'),
  errorMessage: text("error_message"),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdIdx: index("msg_imports_user_id_idx").on(table.userId),
  batchIdIdx: index("msg_imports_batch_id_idx").on(table.batchId),
}));

export const messageImportsRelations = relations(messageImports, ({ one }) => ({
  user: one(users, {
    fields: [messageImports.userId],
    references: [users.id],
  }),
}));

/**
 * OAuth Tokens table - stores OAuth 2.0 tokens for Google and Microsoft integrations
 * Replaces Replit connector dependency for calendar and email access
 */
export const oauthTokens = pgTable("oauth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(), // 'google' | 'microsoft'
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scopes: text("scopes"),
  tokenType: text("token_type").default('Bearer'),
  accountEmail: text("account_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdProviderIdx: uniqueIndex("oauth_tokens_user_provider_idx").on(table.userId, table.provider),
  userIdIdx: index("oauth_tokens_user_id_idx").on(table.userId),
}));

/**
 * OAuth Nonces table - short-lived CSRF protection for OAuth state param
 */
export const oauthNonces = pgTable("oauth_nonces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nonce: varchar("nonce", { length: 64 }).notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(),
  redirectUri: text("redirect_uri"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  nonceIdx: uniqueIndex("oauth_nonces_nonce_idx").on(table.nonce),
  userIdIdx: index("oauth_nonces_user_id_idx").on(table.userId),
}));

export const oauthTokensRelations = relations(oauthTokens, ({ one }) => ({
  user: one(users, {
    fields: [oauthTokens.userId],
    references: [users.id],
  }),
}));

export const insertOauthTokenSchema = createInsertSchema(oauthTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OauthToken = typeof oauthTokens.$inferSelect;
export type InsertOauthToken = z.infer<typeof insertOauthTokenSchema>;

export const insertMessageConversationSchema = createInsertSchema(messageConversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertMessageImportSchema = createInsertSchema(messageImports).omit({
  id: true,
  importedAt: true,
});

export type MessageConversation = typeof messageConversations.$inferSelect;
export type InsertMessageConversation = z.infer<typeof insertMessageConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type MessageImport = typeof messageImports.$inferSelect;
export type InsertMessageImport = z.infer<typeof insertMessageImportSchema>;

/**
 * Relay API — universal inbound gateway
 * Accepts sms / command / event payloads from any authenticated external source
 * (Android background service, Meta glasses, Chrome extension, scripts, etc.)
 */
export const relayDestinations = pgTable("relay_destinations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  apiKey: text("api_key"),
  payloadTypeFilter: text("payload_type_filter").array(), // null = all types, or ['sms','command','event']
  enabled: boolean("enabled").default(true),
  // Outbound relay fields — push events FROM Keryx TO this destination
  outboundEnabled: boolean("outbound_enabled").default(false), // Enable outbound dispatch to this destination
  outboundFormat: text("outbound_format").default("json"), // 'json' or 'text' — how to serialize outbound payloads
  outboundBriefingRelay: boolean("outbound_briefing_relay").default(false), // Relay daily briefing summaries
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("relay_dest_user_id_idx").on(table.userId),
}));

export const relayEvents = pgTable("relay_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  direction: text("direction").default("inbound"), // 'inbound' | 'outbound'
  type: text("type").notNull(), // 'sms' | 'command' | 'event' | 'high_signal' | 'briefing' | 'auto_action' | 'financial_alert'
  source: text("source"), // e.g. 'chrome_extension', 'android_service', 'glasses', 'keryx_agent'
  payload: jsonb("payload").notNull(),
  routedTo: text("routed_to").array(), // destination labels that received this event
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("relay_events_user_id_idx").on(table.userId),
  createdAtIdx: index("relay_events_created_at_idx").on(table.createdAt),
}));

export const insertRelayDestinationSchema = createInsertSchema(relayDestinations).omit({
  id: true,
  createdAt: true,
});
export const insertRelayEventSchema = createInsertSchema(relayEvents).omit({
  id: true,
  createdAt: true,
});

export type RelayDestination = typeof relayDestinations.$inferSelect;
export type InsertRelayDestination = z.infer<typeof insertRelayDestinationSchema>;
export type RelayEvent = typeof relayEvents.$inferSelect;
export type InsertRelayEvent = z.infer<typeof insertRelayEventSchema>;

// ─── Automation Rules Engine (IFTTT-style) ───────────────────────────────────

/**
 * Trigger types — events that can fire an automation rule.
 */
export const AUTOMATION_TRIGGERS = {
  MEMORY_LOGGED:       'memory.logged',        // Any new memory is saved
  MOOD_DROPPED:        'mood.dropped',          // Mood score falls below threshold
  MOOD_SPIKED:         'mood.spiked',           // Mood score rises above threshold
  PERSON_MENTIONED:    'person.mentioned',      // A specific person is mentioned in a memory
  REMINDER_DUE:        'reminder.due',          // A reminder fires
  BRIEFING_GENERATED:  'briefing.generated',    // Morning/afternoon briefing is generated
  GOAL_UPDATED:        'goal.updated',           // Goal progress changes
  KEYWORD_DETECTED:    'keyword.detected',      // A keyword/phrase appears in a memory
  DAILY_SCHEDULE:      'daily.schedule',        // Time-based: fires at a specific time of day
  ACTION_COMPLETED:    'action.completed',      // An AI action is executed successfully
} as const;

/**
 * Action types for automation rules (what the rule DOES when triggered).
 * Distinct from the broader AI_ACTION_TYPES — these are the executable outputs.
 */
export const AUTOMATION_ACTIONS = {
  CREATE_REMINDER:     'create.reminder',       // Create a timed reminder
  SEND_NOTIFICATION:   'send.notification',     // Push a notification
  CREATE_AI_ACTION:    'create.ai_action',      // Queue an AI action for approval
  LOG_MEMORY:          'log.memory',            // Auto-log a structured memory
  RELAY_OUTBOUND:      'relay.outbound',        // Forward content via the relay API
  SEND_EMAIL:          'send.email',            // Send an email (if connected)
} as const;

export const automationRules = pgTable("automation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  // Trigger configuration
  triggerType: text("trigger_type").notNull(), // AUTOMATION_TRIGGERS value
  triggerConditions: jsonb("trigger_conditions"), // Optional condition filters (e.g., {moodBelow: 4, keyword: "stressed"})
  // Action configuration
  actionType: text("action_type").notNull(), // AUTOMATION_ACTIONS value
  actionPayload: jsonb("action_payload").notNull(), // What to do (e.g., {content: "Take a break", minutesFromNow: 30})
  // Execution metadata
  runCount: integer("run_count").default(0).notNull(),
  lastRunAt: timestamp("last_run_at"),
  lastRunResult: text("last_run_result"), // 'success' | 'error'
  lastRunError: text("last_run_error"),
  // Per-day run counting — resets when todayRunDate changes (UTC date string YYYY-MM-DD)
  todayRunDate: text("today_run_date"), // UTC date of the current day window
  todayRunCount: integer("today_run_count").default(0).notNull(),
  // Limits to prevent infinite loops
  maxRunsPerDay: integer("max_runs_per_day").default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("automation_rules_user_id_idx").on(table.userId),
  enabledIdx: index("automation_rules_enabled_idx").on(table.userId, table.enabled),
}));

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({
  id: true,
  runCount: true,
  lastRunAt: true,
  lastRunResult: true,
  lastRunError: true,
  todayRunDate: true,
  todayRunCount: true,
  createdAt: true,
  updatedAt: true,
});

export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
