import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, vector, index, uniqueIndex, real } from "drizzle-orm/pg-core";
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
 * Users table - authentication and user management
 */
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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
  // Email provider settings
  emailProvider: text("email_provider"), // 'gmail' or 'outlook' - default provider for email operations
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(false), // Send email summaries/reminders
  // Provider selection mode: 'default' uses settings, 'ask' prompts per-memory
  providerSelectionMode: text("provider_selection_mode").default("default"), // 'default' or 'ask'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
