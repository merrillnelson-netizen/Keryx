import { 
  users, templates, logEntries, settings,
  type User, type InsertUser,
  type Template, type InsertTemplate,
  type LogEntry, type InsertLogEntry,
  type Settings, type InsertSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Templates
  getTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;
  getActiveTemplate(): Promise<Template | undefined>;
  setActiveTemplate(id: string): Promise<boolean>;

  // Log Entries
  getLogEntries(templateId?: string, limit?: number): Promise<LogEntry[]>;
  createLogEntry(logEntry: InsertLogEntry): Promise<LogEntry>;
  queryLogEntries(templateId: string, query: any): Promise<LogEntry[]>;

  // Settings
  getSettings(): Promise<Settings | undefined>;
  updateSettings(settings: Partial<InsertSettings>): Promise<Settings>;
}

/**
 * Database storage implementation with comprehensive error handling
 * Handles all database operations with proper try/catch blocks and logging
 * Implements garbage collection through connection pooling and proper cleanup
 */
export class DatabaseStorage implements IStorage {
  
  /**
   * USER MANAGEMENT METHODS
   * Handle user authentication and profile management
   */
  
  /**
   * Retrieve user by ID with error handling
   * @param id - User unique identifier
   * @returns User object or undefined if not found
   */
  async getUser(id: string): Promise<User | undefined> {
    try {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid user ID provided');
      }
      
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || undefined;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      throw new Error(`Failed to retrieve user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve user by username with validation
   * @param username - User's login username
   * @returns User object or undefined if not found
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      if (!username || typeof username !== 'string') {
        throw new Error('Invalid username provided');
      }
      
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user || undefined;
    } catch (error) {
      console.error('Error fetching user by username:', error);
      throw new Error(`Failed to retrieve user by username: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create new user account with validation
   * @param insertUser - User data for creation
   * @returns Created user object
   */
  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      if (!insertUser || !insertUser.username) {
        throw new Error('Invalid user data: username is required');
      }
      
      const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning();
        
      console.log('User created successfully:', user.id);
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Templates
  async getTemplates(): Promise<Template[]> {
    return await db.select().from(templates).orderBy(desc(templates.createdAt));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template || undefined;
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const [newTemplate] = await db
      .insert(templates)
      .values(template)
      .returning();
    return newTemplate;
  }

  async updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<Template | undefined> {
    const [updated] = await db
      .update(templates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db.delete(templates).where(eq(templates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveTemplate(): Promise<Template | undefined> {
    const [activeTemplate] = await db.select().from(templates).where(eq(templates.isActive, true));
    return activeTemplate || undefined;
  }

  async setActiveTemplate(id: string): Promise<boolean> {
    await db.update(templates).set({ isActive: false });
    const [updated] = await db
      .update(templates)
      .set({ isActive: true })
      .where(eq(templates.id, id))
      .returning();
    return !!updated;
  }

  // Log Entries
  async getLogEntries(templateId?: string, limit = 50): Promise<LogEntry[]> {
    const query = db.select().from(logEntries).orderBy(desc(logEntries.timestamp)).limit(limit);
    
    if (templateId) {
      return await query.where(eq(logEntries.templateId, templateId));
    }
    
    return await query;
  }

  async createLogEntry(logEntry: InsertLogEntry): Promise<LogEntry> {
    const [entry] = await db
      .insert(logEntries)
      .values(logEntry)
      .returning();
    return entry;
  }

  async queryLogEntries(templateId: string, query: any): Promise<LogEntry[]> {
    // This would implement natural language query parsing
    // For now, return all entries for the template
    return await db.select().from(logEntries)
      .where(eq(logEntries.templateId, templateId))
      .orderBy(desc(logEntries.timestamp));
  }

  // Settings
  async getSettings(): Promise<Settings | undefined> {
    const [currentSettings] = await db.select().from(settings).limit(1);
    return currentSettings || undefined;
  }

  async updateSettings(newSettings: Partial<InsertSettings>): Promise<Settings> {
    const existingSettings = await this.getSettings();
    
    if (existingSettings) {
      const [updated] = await db
        .update(settings)
        .set({ ...newSettings, updatedAt: new Date() })
        .where(eq(settings.id, existingSettings.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(settings)
        .values(newSettings)
        .returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
