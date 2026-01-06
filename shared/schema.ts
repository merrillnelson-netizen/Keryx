import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, json, vector, index, uniqueIndex, real } from "drizzle-orm/pg-core";
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
});

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
  createdAtIdx: index("ai_actions_created_at_idx").on(table.createdAt.desc()),
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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
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
