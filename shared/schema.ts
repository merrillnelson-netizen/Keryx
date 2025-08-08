import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  logFormat: text("log_format").notNull(),
  queryFormat: text("query_format").notNull(),
  fields: jsonb("fields").notNull(), // JSON array of field definitions
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const logEntries = pgTable("log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").references(() => templates.id),
  rawCommand: text("raw_command").notNull(),
  parsedData: jsonb("parsed_data").notNull(), // Structured data extracted from command
  timestamp: timestamp("timestamp").defaultNow(),
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activationPhrase: text("activation_phrase").default("Hey M"),
  voiceResponseEnabled: boolean("voice_response_enabled").default(true),
  confidenceThreshold: integer("confidence_threshold").default(80), // 0-100
  currentTemplateId: varchar("current_template_id").references(() => templates.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const templateRelations = relations(templates, ({ many, one }) => ({
  logEntries: many(logEntries),
  settings: many(settings),
}));

export const logEntryRelations = relations(logEntries, ({ one }) => ({
  template: one(templates, {
    fields: [logEntries.templateId],
    references: [templates.id],
  }),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
  currentTemplate: one(templates, {
    fields: [settings.currentTemplateId],
    references: [templates.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;

export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntries.$inferSelect;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;
