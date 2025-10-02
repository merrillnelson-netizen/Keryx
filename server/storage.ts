import { 
  users, logEntries, settings,
  type User, type InsertUser,
  type LogEntry, type InsertLogEntry,
  type Settings, type InsertSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Memory/Log Entries
  getLogEntries(limit?: number): Promise<LogEntry[]>;
  getLogEntry(id: string): Promise<LogEntry | undefined>;
  createLogEntry(logEntry: InsertLogEntry): Promise<LogEntry>;
  updateLogEntry(id: string, logEntry: Partial<InsertLogEntry>): Promise<LogEntry | undefined>;
  deleteLogEntry(id: string): Promise<boolean>;
  
  // Hybrid Search
  searchMemories(
    queryVector: number[],
    topicTag?: string,
    timestampStart?: Date,
    timestampEnd?: Date,
    metadataFilters?: Record<string, any>,
    limit?: number
  ): Promise<Array<LogEntry & { similarity: number }>>;

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

  /**
   * MEMORY/LOG ENTRY METHODS
   * Handle memory storage and retrieval
   */

  /**
   * Retrieve all log entries with optional limiting
   * @param limit Maximum number of entries to return (default: 50)
   * @returns Promise<LogEntry[]> Array of log entries
   * @throws Error if database query fails
   */
  async getLogEntries(limit = 50): Promise<LogEntry[]> {
    try {
      return await db.select().from(logEntries).orderBy(desc(logEntries.timestamp)).limit(limit);
    } catch (error) {
      console.error('Failed to fetch log entries:', error);
      throw new Error('Database error while fetching log entries');
    }
  }

  /**
   * Retrieve a specific log entry by ID
   * @param id Log entry UUID
   * @returns Promise<LogEntry | undefined> Log entry if found, undefined otherwise
   * @throws Error if database query fails
   */
  async getLogEntry(id: string): Promise<LogEntry | undefined> {
    try {
      if (!id || typeof id !== 'string') {
        return undefined;
      }
      
      const result = await db.select().from(logEntries).where(eq(logEntries.id, id));
      return result[0] || undefined;
    } catch (error) {
      console.error(`Failed to fetch log entry ${id}:`, error);
      throw new Error(`Database error while fetching log entry: ${id}`);
    }
  }

  /**
   * Create a new log entry in the database
   * @param logEntry Log entry data to insert
   * @returns Promise<LogEntry> Created log entry with generated ID
   * @throws Error if creation fails or validation errors occur
   */
  async createLogEntry(logEntry: InsertLogEntry): Promise<LogEntry> {
    try {
      // Validate required fields
      if (!logEntry.memoryText || !logEntry.topicTag || !logEntry.metadataJson) {
        throw new Error('Missing required log entry fields');
      }

      const [entry] = await db
        .insert(logEntries)
        .values(logEntry)
        .returning();
        
      if (!entry) {
        throw new Error('Failed to create log entry - no data returned');
      }
      
      return entry;
    } catch (error) {
      console.error('Failed to create log entry:', error);
      throw error instanceof Error ? error : new Error('Database error while creating log entry');
    }
  }

  /**
   * Update an existing log entry
   * @param id Log entry UUID to update
   * @param logEntry Partial log entry data to update
   * @returns Promise<LogEntry | undefined> Updated log entry or undefined if not found
   * @throws Error if update fails
   */
  async updateLogEntry(id: string, logEntry: Partial<InsertLogEntry>): Promise<LogEntry | undefined> {
    try {
      if (!id || typeof id !== 'string') {
        return undefined;
      }

      // Clean undefined values to avoid database issues
      const cleanedLogEntry = Object.fromEntries(
        Object.entries(logEntry).filter(([_, value]) => value !== undefined)
      );

      if (Object.keys(cleanedLogEntry).length === 0) {
        // No valid updates provided, return existing log entry
        return this.getLogEntry(id);
      }

      const result = await db
        .update(logEntries)
        .set(cleanedLogEntry)
        .where(eq(logEntries.id, id))
        .returning();
      
      return result[0] || undefined;
    } catch (error) {
      console.error(`Failed to update log entry ${id}:`, error);
      throw new Error(`Database error while updating log entry: ${id}`);
    }
  }

  /**
   * Delete a log entry from the database
   * @param id Log entry UUID to delete
   * @returns Promise<boolean> True if deleted, false if not found
   * @throws Error if deletion fails
   */
  async deleteLogEntry(id: string): Promise<boolean> {
    try {
      if (!id || typeof id !== 'string') {
        return false;
      }

      const result = await db.delete(logEntries).where(eq(logEntries.id, id));
      
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Failed to delete log entry ${id}:`, error);
      throw new Error(`Database error while deleting log entry: ${id}`);
    }
  }

  /**
   * Hybrid search: Combine vector similarity with structured filters
   * @param queryVector - Embedding vector for semantic search
   * @param topicTag - Optional topic filter
   * @param timestampStart - Optional start time filter
   * @param timestampEnd - Optional end time filter
   * @param metadataFilters - Optional metadata JSON filters
   * @param limit - Maximum results to return (default: 10)
   * @returns Array of log entries with similarity scores
   */
  async searchMemories(
    queryVector: number[],
    topicTag?: string,
    timestampStart?: Date,
    timestampEnd?: Date,
    metadataFilters?: Record<string, any>,
    limit = 10
  ): Promise<Array<LogEntry & { similarity: number }>> {
    try {
      // Build the WHERE clause conditions
      const conditions: any[] = [];

      if (topicTag) {
        conditions.push(eq(logEntries.topicTag, topicTag));
      }

      if (timestampStart) {
        conditions.push(gte(logEntries.timestamp, timestampStart));
      }

      if (timestampEnd) {
        conditions.push(lte(logEntries.timestamp, timestampEnd));
      }

      // Build metadata JSON filter conditions
      if (metadataFilters && Object.keys(metadataFilters).length > 0) {
        for (const [key, value] of Object.entries(metadataFilters)) {
          // Use jsonb contains operator for filtering
          conditions.push(sql`${logEntries.metadataJson}->>'${sql.raw(key)}' = ${value}`);
        }
      }

      // Convert query vector to pgvector format
      const vectorString = `[${queryVector.join(',')}]`;

      // Perform hybrid search: vector similarity + filters
      const query = db
        .select({
          id: logEntries.id,
          memoryText: logEntries.memoryText,
          topicTag: logEntries.topicTag,
          metadataJson: logEntries.metadataJson,
          embeddingVector: logEntries.embeddingVector,
          timestamp: logEntries.timestamp,
          similarity: sql<number>`1 - (${logEntries.embeddingVector} <=> ${vectorString}::vector)`,
        })
        .from(logEntries)
        .orderBy(sql`${logEntries.embeddingVector} <=> ${vectorString}::vector`)
        .limit(limit);

      // Apply filters if any exist
      if (conditions.length > 0) {
        const result = await query.where(and(...conditions));
        return result as Array<LogEntry & { similarity: number }>;
      } else {
        const result = await query;
        return result as Array<LogEntry & { similarity: number }>;
      }
    } catch (error) {
      console.error('Failed to search memories:', error);
      throw new Error('Database error while searching memories');
    }
  }

  /**
   * SETTINGS METHODS
   * Handle application settings
   */

  async getSettings(): Promise<Settings | undefined> {
    try {
      const [currentSettings] = await db.select().from(settings).limit(1);
      return currentSettings || undefined;
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      throw new Error('Database error while fetching settings');
    }
  }

  async updateSettings(newSettings: Partial<InsertSettings>): Promise<Settings> {
    try {
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
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw new Error('Database error while updating settings');
    }
  }
}

export const storage = new DatabaseStorage();
