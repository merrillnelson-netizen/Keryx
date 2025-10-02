import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const logEntries = pgTable("log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memoryText: text("memory_text").notNull(), // Raw voice-to-text transcription
  topicTag: text("topic_tag").notNull(), // AI-extracted topic (e.g., "Billiards", "Groceries")
  metadataJson: jsonb("metadata_json").notNull(), // AI-extracted structured data
  embeddingVector: vector("embedding_vector", { dimensions: 1536 }), // OpenAI text-embedding-3-small creates 1536-dim vectors
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activationPhrase: text("activation_phrase").default("Hey M"),
  voiceResponseEnabled: boolean("voice_response_enabled").default(true),
  confidenceThreshold: integer("confidence_threshold").default(80), // 0-100
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
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

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntries.$inferSelect;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;
