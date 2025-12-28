import { 
  users, logEntries, settings, categories, people, aiActions, aiActionPreferences,
  type User, type InsertUser,
  type LogEntry, type InsertLogEntry,
  type Settings, type InsertSettings,
  type Category, type InsertCategory,
  type Person, type InsertPerson,
  type AiAction, type InsertAiAction,
  type AiActionPreference, type InsertAiActionPreference
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Memory/Log Entries (user-scoped)
  getLogEntries(userId: string, limit?: number, offset?: number): Promise<LogEntry[]>;
  getLogEntriesLight(userId: string, limit?: number, offset?: number): Promise<Partial<LogEntry>[]>;
  getLogEntriesCount(userId: string): Promise<number>;
  getLogEntry(id: string, userId: string): Promise<LogEntry | undefined>;
  createLogEntry(logEntry: InsertLogEntry): Promise<LogEntry>;
  updateLogEntry(id: string, userId: string, logEntry: Partial<InsertLogEntry>): Promise<LogEntry | undefined>;
  deleteLogEntry(id: string, userId: string): Promise<boolean>;
  
  // Hybrid Search (user-scoped)
  searchMemories(
    userId: string,
    queryVector: number[],
    topicTag?: string,
    timestampStart?: Date,
    timestampEnd?: Date,
    metadataFilters?: Record<string, any>,
    limit?: number
  ): Promise<Array<LogEntry & { similarity: number }>>;

  // Categories (user-scoped)
  getCategories(userId: string): Promise<Category[]>;
  createCategory(userId: string, name: string): Promise<Category>;
  createCategoryIfNotExists(userId: string, name: string): Promise<Category>;

  // Settings (user-scoped)
  getSettings(userId: string): Promise<Settings | undefined>;
  updateSettings(userId: string, settings: Partial<InsertSettings>): Promise<Settings>;
  findSettingsByTelegramChatId(chatId: string): Promise<Settings | undefined>;
  findSettingsByTelegramVerificationCode(code: string): Promise<Settings | undefined>;

  // People tracking (user-scoped)
  getPeople(userId: string): Promise<Person[]>;
  getPerson(userId: string, name: string): Promise<Person | undefined>;
  upsertPerson(userId: string, name: string): Promise<Person>;
  updatePerson(userId: string, id: string, data: Partial<InsertPerson>): Promise<Person | undefined>;
  deletePerson(userId: string, id: string): Promise<boolean>;
  getPersonMentions(userId: string, personName: string): Promise<LogEntry[]>;
  
  // Mood analytics (user-scoped)
  getMoodStats(userId: string, days?: number): Promise<{ mood: string; count: number; avgScore: number }[]>;
  getEntriesByMood(userId: string, mood: string): Promise<LogEntry[]>;
  
  // Time capsule - memories from this day in previous years
  getOnThisDayMemories(userId: string): Promise<LogEntry[]>;
  
  // AI Actions (user-scoped)
  getAiActions(userId: string, status?: string[], limit?: number): Promise<AiAction[]>;
  getAiAction(id: string, userId: string): Promise<AiAction | undefined>;
  createAiAction(action: InsertAiAction): Promise<AiAction>;
  updateAiAction(id: string, userId: string, updates: Partial<InsertAiAction>): Promise<AiAction | undefined>;
  getPendingActions(userId: string): Promise<AiAction[]>;
  
  // AI Action Preferences (user-scoped)
  getAiActionPreferences(userId: string): Promise<AiActionPreference[]>;
  getAiActionPreference(userId: string, actionType: string): Promise<AiActionPreference | undefined>;
  upsertAiActionPreference(userId: string, actionType: string, policy: string, conditions?: any): Promise<AiActionPreference>;
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
   * Retrieve all log entries for a specific user with optional limiting
   * @param userId User ID to filter entries
   * @param limit Maximum number of entries to return (default: 50)
   * @returns Promise<LogEntry[]> Array of log entries
   * @throws Error if database query fails
   */
  async getLogEntries(userId: string, limit = 50, offset = 0): Promise<LogEntry[]> {
    try {
      return await db
        .select()
        .from(logEntries)
        .where(eq(logEntries.userId, userId))
        .orderBy(desc(logEntries.timestamp))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error('Failed to fetch log entries:', error);
      throw new Error('Database error while fetching log entries');
    }
  }

  /**
   * Get log entries with only essential fields for list views (excludes heavy data)
   * Reduces payload size significantly by omitting embeddings and full metadata
   */
  async getLogEntriesLight(userId: string, limit = 50, offset = 0): Promise<Partial<LogEntry>[]> {
    try {
      return await db
        .select({
          id: logEntries.id,
          userId: logEntries.userId,
          memoryText: logEntries.memoryText,
          topicTag: logEntries.topicTag,
          mood: logEntries.mood,
          moodScore: logEntries.moodScore,
          detectedPeople: logEntries.detectedPeople,
          timestamp: logEntries.timestamp,
          calendarEventId: logEntries.calendarEventId,
          calendarEventTitle: logEntries.calendarEventTitle,
          calendarEventAttendees: logEntries.calendarEventAttendees,
          geoPlaceName: logEntries.geoPlaceName,
          aiReasoning: logEntries.aiReasoning,
        })
        .from(logEntries)
        .where(eq(logEntries.userId, userId))
        .orderBy(desc(logEntries.timestamp))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error('Failed to fetch log entries (light):', error);
      throw new Error('Database error while fetching log entries');
    }
  }

  /**
   * Get total count of log entries for pagination
   */
  async getLogEntriesCount(userId: string): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(logEntries)
        .where(eq(logEntries.userId, userId));
      return result[0]?.count ?? 0;
    } catch (error) {
      console.error('Failed to count log entries:', error);
      throw new Error('Database error while counting log entries');
    }
  }

  /**
   * Retrieve a specific log entry by ID and userId for security
   * @param id Log entry UUID
   * @param userId User ID to verify ownership
   * @returns Promise<LogEntry | undefined> Log entry if found, undefined otherwise
   * @throws Error if database query fails
   */
  async getLogEntry(id: string, userId: string): Promise<LogEntry | undefined> {
    try {
      if (!id || typeof id !== 'string' || !userId || typeof userId !== 'string') {
        return undefined;
      }
      
      const result = await db
        .select()
        .from(logEntries)
        .where(and(eq(logEntries.id, id), eq(logEntries.userId, userId)));
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
   * Update an existing log entry with userId verification
   * @param id Log entry UUID to update
   * @param userId User ID to verify ownership
   * @param logEntry Partial log entry data to update
   * @returns Promise<LogEntry | undefined> Updated log entry or undefined if not found
   * @throws Error if update fails
   */
  async updateLogEntry(id: string, userId: string, logEntry: Partial<InsertLogEntry>): Promise<LogEntry | undefined> {
    try {
      if (!id || typeof id !== 'string' || !userId || typeof userId !== 'string') {
        return undefined;
      }

      // Clean undefined values to avoid database issues
      const cleanedLogEntry = Object.fromEntries(
        Object.entries(logEntry).filter(([_, value]) => value !== undefined)
      );

      if (Object.keys(cleanedLogEntry).length === 0) {
        // No valid updates provided, return existing log entry
        return this.getLogEntry(id, userId);
      }

      const result = await db
        .update(logEntries)
        .set(cleanedLogEntry)
        .where(and(eq(logEntries.id, id), eq(logEntries.userId, userId)))
        .returning();
      
      return result[0] || undefined;
    } catch (error) {
      console.error(`Failed to update log entry ${id}:`, error);
      throw new Error(`Database error while updating log entry: ${id}`);
    }
  }

  /**
   * Delete a log entry from the database with userId verification
   * @param id Log entry UUID to delete
   * @param userId User ID to verify ownership
   * @returns Promise<boolean> True if deleted, false if not found
   * @throws Error if deletion fails
   */
  async deleteLogEntry(id: string, userId: string): Promise<boolean> {
    try {
      if (!id || typeof id !== 'string' || !userId || typeof userId !== 'string') {
        return false;
      }

      const result = await db
        .delete(logEntries)
        .where(and(eq(logEntries.id, id), eq(logEntries.userId, userId)));
      
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`Failed to delete log entry ${id}:`, error);
      throw new Error(`Database error while deleting log entry: ${id}`);
    }
  }

  /**
   * Hybrid search: Combine vector similarity with structured filters (user-scoped)
   * @param userId - User ID to filter results
   * @param queryVector - Embedding vector for semantic search
   * @param topicTag - Optional topic filter
   * @param timestampStart - Optional start time filter
   * @param timestampEnd - Optional end time filter
   * @param metadataFilters - Optional metadata JSON filters
   * @param limit - Maximum results to return (default: 10)
   * @returns Array of log entries with similarity scores
   */
  async searchMemories(
    userId: string,
    queryVector: number[],
    topicTag?: string,
    timestampStart?: Date,
    timestampEnd?: Date,
    metadataFilters?: Record<string, any>,
    limit = 10
  ): Promise<Array<LogEntry & { similarity: number }>> {
    try {
      // Build the WHERE clause conditions - always include userId filter
      const conditions: any[] = [eq(logEntries.userId, userId)];

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
      const result = await db
        .select({
          id: logEntries.id,
          userId: logEntries.userId,
          memoryText: logEntries.memoryText,
          topicTag: logEntries.topicTag,
          metadataJson: logEntries.metadataJson,
          embeddingVector: logEntries.embeddingVector,
          timestamp: logEntries.timestamp,
          similarity: sql<number>`1 - (${logEntries.embeddingVector} <=> ${vectorString}::vector)`,
        })
        .from(logEntries)
        .where(and(...conditions))
        .orderBy(sql`${logEntries.embeddingVector} <=> ${vectorString}::vector`)
        .limit(limit);

      return result as Array<LogEntry & { similarity: number }>;
    } catch (error) {
      console.error('Failed to search memories:', error);
      throw new Error('Database error while searching memories');
    }
  }

  /**
   * CATEGORY METHODS
   * Handle user-defined categories
   */

  async getCategories(userId: string): Promise<Category[]> {
    try {
      return await db
        .select()
        .from(categories)
        .where(eq(categories.userId, userId))
        .orderBy(desc(categories.createdAt));
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      throw new Error('Database error while fetching categories');
    }
  }

  async createCategory(userId: string, name: string): Promise<Category> {
    try {
      const [category] = await db
        .insert(categories)
        .values({ userId, name })
        .returning();
      return category;
    } catch (error) {
      console.error('Failed to create category:', error);
      throw new Error('Database error while creating category');
    }
  }

  async createCategoryIfNotExists(userId: string, name: string): Promise<Category> {
    try {
      // Check if category already exists for this user
      const [existing] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.userId, userId), eq(categories.name, name)))
        .limit(1);
      
      if (existing) {
        return existing;
      }
      
      // Create new category
      return await this.createCategory(userId, name);
    } catch (error) {
      console.error('Failed to create category if not exists:', error);
      throw new Error('Database error while creating category');
    }
  }

  /**
   * SETTINGS METHODS
   * Handle application settings (user-scoped)
   */

  async getSettings(userId: string): Promise<Settings | undefined> {
    try {
      const [currentSettings] = await db
        .select()
        .from(settings)
        .where(eq(settings.userId, userId))
        .limit(1);
      return currentSettings || undefined;
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      throw new Error('Database error while fetching settings');
    }
  }

  async updateSettings(userId: string, newSettings: Partial<InsertSettings>): Promise<Settings> {
    try {
      const existingSettings = await this.getSettings(userId);
      
      if (existingSettings) {
        // Merge with existing settings - only update fields that are explicitly provided (not undefined)
        const mergedSettings: Record<string, any> = { updatedAt: new Date() };
        for (const [key, value] of Object.entries(newSettings)) {
          if (value !== undefined) {
            mergedSettings[key] = value;
          }
        }
        
        const [updated] = await db
          .update(settings)
          .set(mergedSettings)
          .where(and(eq(settings.id, existingSettings.id), eq(settings.userId, userId)))
          .returning();
        return updated;
      } else {
        // For new settings, use defaults for any missing fields
        const defaultSettings = {
          voiceResponseEnabled: true,
          autoSaveEnabled: true,
          calendarAutoLinkEnabled: true,
          calendarProvider: null,
          emailProvider: null,
          emailIntegrationEnabled: true,
          emailNotificationsEnabled: false,
          providerSelectionMode: 'default',
          activeProjects: [],
          ...newSettings,
        };
        
        const [created] = await db
          .insert(settings)
          .values({ ...defaultSettings, userId })
          .returning();
        return created;
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw new Error('Database error while updating settings');
    }
  }

  async findSettingsByTelegramChatId(chatId: string): Promise<Settings | undefined> {
    try {
      const [result] = await db
        .select()
        .from(settings)
        .where(eq(settings.telegramChatId, chatId))
        .limit(1);
      return result || undefined;
    } catch (error) {
      console.error('Failed to find settings by Telegram chat ID:', error);
      throw new Error('Database error while finding settings by Telegram chat ID');
    }
  }

  async findSettingsByTelegramVerificationCode(code: string): Promise<Settings | undefined> {
    try {
      const [result] = await db
        .select()
        .from(settings)
        .where(eq(settings.telegramVerificationCode, code))
        .limit(1);
      return result || undefined;
    } catch (error) {
      console.error('Failed to find settings by Telegram verification code:', error);
      throw new Error('Database error while finding settings by verification code');
    }
  }

  /**
   * PEOPLE TRACKING METHODS
   * Handle people mentioned in memories
   */

  async getPeople(userId: string): Promise<Person[]> {
    try {
      return await db
        .select()
        .from(people)
        .where(eq(people.userId, userId))
        .orderBy(desc(people.mentionCount));
    } catch (error) {
      console.error('Failed to fetch people:', error);
      throw new Error('Database error while fetching people');
    }
  }

  async getPerson(userId: string, name: string): Promise<Person | undefined> {
    try {
      const [person] = await db
        .select()
        .from(people)
        .where(and(eq(people.userId, userId), eq(people.name, name)))
        .limit(1);
      return person || undefined;
    } catch (error) {
      console.error('Failed to fetch person:', error);
      throw new Error('Database error while fetching person');
    }
  }

  async upsertPerson(userId: string, name: string): Promise<Person> {
    try {
      const existing = await this.getPerson(userId, name);
      
      if (existing) {
        const [updated] = await db
          .update(people)
          .set({ 
            mentionCount: sql`${people.mentionCount} + 1`,
            lastMentioned: new Date()
          })
          .where(and(eq(people.userId, userId), eq(people.name, name)))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(people)
          .values({ userId, name, mentionCount: 1 })
          .returning();
        return created;
      }
    } catch (error) {
      console.error('Failed to upsert person:', error);
      throw new Error('Database error while upserting person');
    }
  }

  async updatePerson(userId: string, id: string, data: Partial<InsertPerson>): Promise<Person | undefined> {
    try {
      const [updated] = await db
        .update(people)
        .set(data)
        .where(and(eq(people.userId, userId), eq(people.id, id)))
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error('Failed to update person:', error);
      throw new Error('Database error while updating person');
    }
  }

  async deletePerson(userId: string, id: string): Promise<boolean> {
    try {
      const deleted = await db
        .delete(people)
        .where(and(eq(people.userId, userId), eq(people.id, id)))
        .returning();
      return deleted.length > 0;
    } catch (error) {
      console.error('Failed to delete person:', error);
      throw new Error('Database error while deleting person');
    }
  }

  async getPersonMentions(userId: string, personName: string): Promise<LogEntry[]> {
    try {
      return await db
        .select()
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          sql`${personName} = ANY(${logEntries.detectedPeople})`
        ))
        .orderBy(desc(logEntries.timestamp));
    } catch (error) {
      console.error('Failed to fetch person mentions:', error);
      throw new Error('Database error while fetching person mentions');
    }
  }

  /**
   * Recalculate and sync mention counts for all people based on actual memories
   * This fixes any drift between stored counts and real data
   */
  async syncPeopleMentionCounts(userId: string): Promise<{ updated: number }> {
    try {
      const userPeople = await this.getPeople(userId);
      let updated = 0;

      for (const person of userPeople) {
        // Count actual memories mentioning this person
        const mentions = await this.getPersonMentions(userId, person.name);
        const actualCount = mentions.length;
        
        // Find the most recent mention date
        const lastMentioned = mentions.length > 0 
          ? mentions[0].timestamp 
          : person.lastMentioned;

        // Update if count differs
        if (actualCount !== person.mentionCount) {
          await db
            .update(people)
            .set({ 
              mentionCount: actualCount,
              lastMentioned: lastMentioned
            })
            .where(eq(people.id, person.id));
          updated++;
        }
      }

      return { updated };
    } catch (error) {
      console.error('Failed to sync people mention counts:', error);
      throw new Error('Database error while syncing mention counts');
    }
  }

  /**
   * MOOD ANALYTICS METHODS
   * Analyze emotional patterns across memories
   */

  async getMoodStats(userId: string, days = 30): Promise<{ mood: string; count: number; avgScore: number }[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await db
        .select({
          mood: logEntries.mood,
          count: sql<number>`count(*)::int`,
          avgScore: sql<number>`avg(${logEntries.moodScore})::int`,
        })
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          gte(logEntries.timestamp, startDate),
          sql`${logEntries.mood} IS NOT NULL`
        ))
        .groupBy(logEntries.mood);

      return result.map(r => ({
        mood: r.mood || 'neutral',
        count: r.count,
        avgScore: r.avgScore || 0,
      }));
    } catch (error) {
      console.error('Failed to fetch mood stats:', error);
      throw new Error('Database error while fetching mood stats');
    }
  }

  async getEntriesByMood(userId: string, mood: string): Promise<LogEntry[]> {
    try {
      return await db
        .select()
        .from(logEntries)
        .where(and(eq(logEntries.userId, userId), eq(logEntries.mood, mood)))
        .orderBy(desc(logEntries.timestamp));
    } catch (error) {
      console.error('Failed to fetch entries by mood:', error);
      throw new Error('Database error while fetching entries by mood');
    }
  }

  /**
   * Get daily mood trend data for line chart visualization
   */
  async getMoodTrend(userId: string, days = 30): Promise<{ date: string; avgScore: number; count: number }[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await db
        .select({
          date: sql<string>`date_trunc('day', ${logEntries.timestamp})::date::text`,
          avgScore: sql<number>`avg(${logEntries.moodScore})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          gte(logEntries.timestamp, startDate),
          sql`${logEntries.moodScore} IS NOT NULL`
        ))
        .groupBy(sql`date_trunc('day', ${logEntries.timestamp})`)
        .orderBy(sql`date_trunc('day', ${logEntries.timestamp})`);

      return result.map(r => ({
        date: r.date,
        avgScore: r.avgScore || 0,
        count: r.count,
      }));
    } catch (error) {
      console.error('Failed to fetch mood trend:', error);
      throw new Error('Database error while fetching mood trend');
    }
  }

  /**
   * Get topic frequency for bar chart visualization
   */
  async getTopicFrequency(userId: string, days = 30): Promise<{ topic: string; count: number }[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await db
        .select({
          topic: logEntries.topicTag,
          count: sql<number>`count(*)::int`,
        })
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          gte(logEntries.timestamp, startDate)
        ))
        .groupBy(logEntries.topicTag)
        .orderBy(sql`count(*) DESC`)
        .limit(15);

      return result.map(r => ({
        topic: r.topic,
        count: r.count,
      }));
    } catch (error) {
      console.error('Failed to fetch topic frequency:', error);
      throw new Error('Database error while fetching topic frequency');
    }
  }

  /**
   * TIME CAPSULE METHODS
   * Surface memories from this day in previous years
   */

  async getOnThisDayMemories(userId: string): Promise<LogEntry[]> {
    try {
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      const currentYear = today.getFullYear();

      return await db
        .select()
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          sql`EXTRACT(MONTH FROM ${logEntries.timestamp}) = ${month}`,
          sql`EXTRACT(DAY FROM ${logEntries.timestamp}) = ${day}`,
          sql`EXTRACT(YEAR FROM ${logEntries.timestamp}) < ${currentYear}`
        ))
        .orderBy(desc(logEntries.timestamp));
    } catch (error) {
      console.error('Failed to fetch on this day memories:', error);
      throw new Error('Database error while fetching on this day memories');
    }
  }

  /**
   * AI ACTIONS METHODS
   * Handle AI-proposed and executed actions with approval workflows
   */

  async getAiActions(userId: string, status?: string[], limit = 50): Promise<AiAction[]> {
    try {
      const conditions = [eq(aiActions.userId, userId)];
      if (status && status.length > 0) {
        conditions.push(inArray(aiActions.status, status));
      }
      
      return await db
        .select()
        .from(aiActions)
        .where(and(...conditions))
        .orderBy(desc(aiActions.createdAt))
        .limit(limit);
    } catch (error) {
      console.error('Failed to fetch AI actions:', error);
      throw new Error('Database error while fetching AI actions');
    }
  }

  async getAiAction(id: string, userId: string): Promise<AiAction | undefined> {
    try {
      const [action] = await db
        .select()
        .from(aiActions)
        .where(and(eq(aiActions.id, id), eq(aiActions.userId, userId)));
      return action;
    } catch (error) {
      console.error('Failed to fetch AI action:', error);
      throw new Error('Database error while fetching AI action');
    }
  }

  async createAiAction(action: InsertAiAction): Promise<AiAction> {
    try {
      const [created] = await db
        .insert(aiActions)
        .values(action)
        .returning();
      return created;
    } catch (error) {
      console.error('Failed to create AI action:', error);
      throw new Error('Database error while creating AI action');
    }
  }

  async updateAiAction(id: string, userId: string, updates: Partial<InsertAiAction>): Promise<AiAction | undefined> {
    try {
      const [updated] = await db
        .update(aiActions)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(aiActions.id, id), eq(aiActions.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to update AI action:', error);
      throw new Error('Database error while updating AI action');
    }
  }

  async getPendingActions(userId: string): Promise<AiAction[]> {
    try {
      return await db
        .select()
        .from(aiActions)
        .where(and(
          eq(aiActions.userId, userId),
          eq(aiActions.status, 'pending')
        ))
        .orderBy(desc(aiActions.createdAt));
    } catch (error) {
      console.error('Failed to fetch pending actions:', error);
      throw new Error('Database error while fetching pending actions');
    }
  }

  /**
   * AI ACTION PREFERENCES METHODS
   * Handle user preferences for AI action execution policies
   */

  async getAiActionPreferences(userId: string): Promise<AiActionPreference[]> {
    try {
      return await db
        .select()
        .from(aiActionPreferences)
        .where(eq(aiActionPreferences.userId, userId));
    } catch (error) {
      console.error('Failed to fetch AI action preferences:', error);
      throw new Error('Database error while fetching AI action preferences');
    }
  }

  async getAiActionPreference(userId: string, actionType: string): Promise<AiActionPreference | undefined> {
    try {
      const [pref] = await db
        .select()
        .from(aiActionPreferences)
        .where(and(
          eq(aiActionPreferences.userId, userId),
          eq(aiActionPreferences.actionType, actionType)
        ));
      return pref;
    } catch (error) {
      console.error('Failed to fetch AI action preference:', error);
      throw new Error('Database error while fetching AI action preference');
    }
  }

  async upsertAiActionPreference(
    userId: string, 
    actionType: string, 
    policy: string, 
    conditions?: any
  ): Promise<AiActionPreference> {
    try {
      const existing = await this.getAiActionPreference(userId, actionType);
      
      if (existing) {
        const [updated] = await db
          .update(aiActionPreferences)
          .set({ 
            policy, 
            autoApproveConditions: conditions,
            updatedAt: new Date() 
          })
          .where(eq(aiActionPreferences.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(aiActionPreferences)
          .values({
            userId,
            actionType,
            policy,
            autoApproveConditions: conditions
          })
          .returning();
        return created;
      }
    } catch (error) {
      console.error('Failed to upsert AI action preference:', error);
      throw new Error('Database error while upserting AI action preference');
    }
  }
}

export const storage = new DatabaseStorage();
