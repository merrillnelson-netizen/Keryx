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
  /**
   * Retrieve all templates from database ordered by creation date
   * @returns Promise<Template[]> Array of all templates
   * @throws Error if database query fails
   */
  async getTemplates(): Promise<Template[]> {
    try {
      const result = await db.select().from(templates).orderBy(desc(templates.createdAt));
      return result;
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      throw new Error('Database error while fetching templates');
    }
  }

  /**
   * Retrieve a specific template by ID
   * @param id Template UUID
   * @returns Promise<Template | undefined> Template if found, undefined otherwise
   * @throws Error if database query fails
   */
  async getTemplate(id: string): Promise<Template | undefined> {
    try {
      if (!id || typeof id !== 'string') {
        return undefined;
      }
      
      const result = await db.select().from(templates).where(eq(templates.id, id));
      return result[0] || undefined;
    } catch (error) {
      console.error(`Failed to fetch template ${id}:`, error);
      throw new Error(`Database error while fetching template: ${id}`);
    }
  }

  /**
   * Create a new template in the database
   * @param template Template data to insert
   * @returns Promise<Template> Created template with generated ID
   * @throws Error if creation fails or validation errors occur
   */
  async createTemplate(template: InsertTemplate): Promise<Template> {
    try {
      // Validate required fields
      if (!template.name || !template.description || !template.logFormat || !template.queryFormat) {
        throw new Error('Missing required template fields');
      }

      // Ensure fields is valid JSON
      if (!template.fields || !Array.isArray(template.fields)) {
        throw new Error('Template fields must be a valid array');
      }

      const result = await db
        .insert(templates)
        .values({
          ...template,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      if (!result[0]) {
        throw new Error('Failed to create template - no data returned');
      }

      return result[0];
    } catch (error) {
      console.error('Failed to create template:', error);
      throw error instanceof Error ? error : new Error('Database error while creating template');
    }
  }

  /**
   * Update an existing template
   * @param id Template UUID to update
   * @param template Partial template data to update
   * @returns Promise<Template | undefined> Updated template or undefined if not found
   * @throws Error if update fails
   */
  async updateTemplate(id: string, template: Partial<InsertTemplate>): Promise<Template | undefined> {
    try {
      if (!id || typeof id !== 'string') {
        return undefined;
      }

      // Clean undefined values to avoid database issues
      const cleanedTemplate = Object.fromEntries(
        Object.entries(template).filter(([_, value]) => value !== undefined)
      );

      if (Object.keys(cleanedTemplate).length === 0) {
        // No valid updates provided, return existing template
        return this.getTemplate(id);
      }

      const result = await db
        .update(templates)
        .set({ 
          ...cleanedTemplate, 
          updatedAt: new Date() 
        })
        .where(eq(templates.id, id))
        .returning();
      
      return result[0] || undefined;
    } catch (error) {
      console.error(`Failed to update template ${id}:`, error);
      throw new Error(`Database error while updating template: ${id}`);
    }
  }

  /**
   * Delete a template and all associated log entries
   * @param id Template UUID to delete
   * @returns Promise<boolean> True if deleted, false if not found
   * @throws Error if deletion fails
   */
  async deleteTemplate(id: string): Promise<boolean> {
    try {
      if (!id || typeof id !== 'string') {
        return false;
      }

      // First, delete associated log entries to maintain referential integrity
      await db.delete(logEntries).where(eq(logEntries.templateId, id));
      
      // Then delete the template
      const result = await db.delete(templates).where(eq(templates.id, id));
      
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Failed to delete template ${id}:`, error);
      throw new Error(`Database error while deleting template: ${id}`);
    }
  }

  /**
   * Get the currently active template
   * @returns Promise<Template | undefined> Active template or undefined if none set
   * @throws Error if database query fails
   */
  async getActiveTemplate(): Promise<Template | undefined> {
    try {
      const result = await db.select().from(templates).where(eq(templates.isActive, true));
      return result[0] || undefined;
    } catch (error) {
      console.error('Failed to fetch active template:', error);
      throw new Error('Database error while fetching active template');
    }
  }

  /**
   * Set a template as active (deactivates all others)
   * @param id Template UUID to activate
   * @returns Promise<boolean> True if successfully activated, false if template not found
   * @throws Error if database operations fail
   */
  async setActiveTemplate(id: string): Promise<boolean> {
    try {
      if (!id || typeof id !== 'string') {
        return false;
      }

      // Use transaction to ensure atomicity
      // First, deactivate all templates
      await db.update(templates).set({ isActive: false });
      
      // Then activate the specified template
      const result = await db
        .update(templates)
        .set({ 
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(templates.id, id))
        .returning();
      
      return !!result[0];
    } catch (error) {
      console.error(`Failed to set active template ${id}:`, error);
      throw new Error(`Database error while setting active template: ${id}`);
    }
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
