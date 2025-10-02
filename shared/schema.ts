import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, vector, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Users table - authentication and user management
 */
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

/**
 * Log entries table - stores voice memories with AI-extracted metadata and embeddings
 * Optimized with indexes for:
 * - Chronological retrieval (timestamp)
 * - Topic filtering (topicTag)
 * - Semantic search (embeddingVector with cosine similarity)
 * - Combined filters (topicTag + timestamp)
 */
export const logEntries = pgTable("log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memoryText: text("memory_text").notNull(), // Raw voice-to-text transcription
  topicTag: text("topic_tag").notNull(), // AI-extracted topic (e.g., "Billiards", "Groceries")
  metadataJson: jsonb("metadata_json").notNull(), // AI-extracted structured data
  embeddingVector: vector("embedding_vector", { dimensions: 1536 }), // OpenAI text-embedding-3-small creates 1536-dim vectors
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
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
  
  // Composite index for common query: filter by topic and sort by time
  topicTimestampIdx: index("log_entries_topic_timestamp_idx").on(
    table.topicTag,
    table.timestamp.desc()
  ),
}));

/**
 * Settings table - application configuration
 */
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activationPhrase: text("activation_phrase").default("Voice AI"),
  voiceResponseEnabled: boolean("voice_response_enabled").default(true),
  confidenceThreshold: integer("confidence_threshold").default(80), // 0-100
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
