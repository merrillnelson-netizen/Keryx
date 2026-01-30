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
  name: text("name").notNull(), // Person's name as detected/entered
  relationship: text("relationship"), // e.g., "colleague", "friend", "family", "client"
  notes: text("notes"), // User notes about this person
  mentionCount: integer("mention_count").default(0), // How many times mentioned
  firstMentioned: timestamp("first_mentioned").defaultNow().notNull(),
  lastMentioned: timestamp("last_mentioned").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("people_user_id_idx").on(table.userId),
  uniqueUserPerson: uniqueIndex("people_user_name_idx").on(table.userId, table.name),
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
  // Telegram integration settings
  telegramChatId: text("telegram_chat_id"), // User's Telegram chat ID for sending messages
  telegramEnabled: boolean("telegram_enabled").default(false), // Master toggle for Telegram features
  telegramBriefingsEnabled: boolean("telegram_briefings_enabled").default(true), // Send morning briefings via Telegram
  telegramAlertsEnabled: boolean("telegram_alerts_enabled").default(true), // Send pattern alerts via Telegram
  telegramVerificationCode: text("telegram_verification_code"), // Temporary code for linking account
  telegramVerificationExpires: timestamp("telegram_verification_expires"), // Code expiration time
  // Plaid/Financial integration settings
  plaidEnabled: boolean("plaid_enabled").default(false), // Master toggle for financial features
  plaidIncludeInBriefings: boolean("plaid_include_in_briefings").default(true), // Include spending insights in morning briefings
  plaidTransactionDaysToShow: integer("plaid_transaction_days_to_show").default(7), // Days of transactions to display
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  CALENDAR_CREATE: 'calendar.create',
  CALENDAR_UPDATE: 'calendar.update', 
  CALENDAR_DELETE: 'calendar.delete',
  EMAIL_SEND: 'email.send',
  EMAIL_REPLY: 'email.reply',
  REMINDER_CREATE: 'reminder.create',
  PERSON_UPDATE: 'person.update',
} as const;

export const AI_ACTION_CATEGORIES = {
  CALENDAR: 'calendar',
  EMAIL: 'email',
  REMINDER: 'reminder',
  PEOPLE: 'people',
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

export type CalendarCreatePayload = z.infer<typeof calendarCreatePayloadSchema>;
export type EmailSendPayload = z.infer<typeof emailSendPayloadSchema>;
export type ReminderCreatePayload = z.infer<typeof reminderCreatePayloadSchema>;

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

export const ideas = pgTable("ideas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  stage: text("stage").notNull().default('spark'),
  chatHistory: jsonb("chat_history").default([]), // Array of { role: 'user'|'assistant', content: string, timestamp: string }
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("ideas_user_id_idx").on(table.userId),
  stageIdx: index("ideas_stage_idx").on(table.stage),
  userStageIdx: index("ideas_user_stage_idx").on(table.userId, table.stage),
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
