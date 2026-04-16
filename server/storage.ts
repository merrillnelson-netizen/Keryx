import { 
  users, logEntries, settings, categories, people, aiActions, aiActionPreferences, aiCache, ideas, ideaTasks,
  locationHistory, frequentPlaces, pushSubscriptions, goals, reminders,
  messageConversations, messages, messageImports,
  relayDestinations, relayEvents,
  automationRules,
  aiChatSessions, aiChatMessages,
  type User, type InsertUser,
  type LogEntry, type InsertLogEntry,
  type Settings, type InsertSettings,
  type Category, type InsertCategory,
  type Person, type InsertPerson,
  type AiAction, type InsertAiAction,
  type AiActionPreference, type InsertAiActionPreference,
  type AiCache,
  type Idea, type InsertIdea,
  type IdeaTask, type InsertIdeaTask,
  type IdeaChatMessage,
  type LocationHistory, type InsertLocationHistory,
  type FrequentPlace, type InsertFrequentPlace,
  type PushSubscription, type InsertPushSubscription,
  type Goal, type InsertGoal, type GoalMilestone,
  type Reminder, type InsertReminder,
  type MessageConversation, type InsertMessageConversation,
  type Message, type InsertMessage,
  type MessageImport, type InsertMessageImport,
  type RelayDestination, type InsertRelayDestination,
  type RelayEvent, type InsertRelayEvent,
  type AutomationRule, type InsertAutomationRule,
  profileObservations,
  type ProfileObservation, type InsertProfileObservation,
  type AiChatSession, type InsertAiChatSession,
  type AiChatMessage, type InsertAiChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, gte, lte, isNull, isNotNull, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  getMonthlyMemoryCount(userId: string, since: Date): Promise<number>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  countFoundingMembers(): Promise<number>;

  // Memory/Log Entries (user-scoped)
  getLogEntries(userId: string, limit?: number, offset?: number): Promise<LogEntry[]>;
  getLogEntriesLight(userId: string, limit?: number, offset?: number): Promise<Partial<LogEntry>[]>;
  getLogEntriesCount(userId: string): Promise<number>;
  getLogEntry(id: string, userId: string): Promise<LogEntry | undefined>;
  getRecentLogEntries(userId: string, daysBack: number, limit?: number): Promise<LogEntry[]>;
  getRecentLogEntriesLight(userId: string, daysBack: number, limit?: number): Promise<Partial<LogEntry>[]>;
  createLogEntry(logEntry: InsertLogEntry): Promise<LogEntry>;
  updateLogEntry(id: string, userId: string, logEntry: Partial<InsertLogEntry>): Promise<LogEntry | undefined>;
  deleteLogEntry(id: string, userId: string): Promise<boolean>;
  
  // Hybrid Search (user-scoped) - returns partial entries without embeddingVector for performance
  searchMemories(
    userId: string,
    queryVector: number[],
    topicTag?: string,
    timestampStart?: Date,
    timestampEnd?: Date,
    metadataFilters?: Record<string, any>,
    limit?: number
  ): Promise<Array<Partial<LogEntry> & { similarity: number }>>;

  // Categories (user-scoped)
  getCategories(userId: string): Promise<Category[]>;
  createCategory(userId: string, name: string): Promise<Category>;
  createCategoryIfNotExists(userId: string, name: string): Promise<Category>;

  // Settings (user-scoped)
  getSettings(userId: string): Promise<Settings | undefined>;
  updateSettings(userId: string, settings: Partial<InsertSettings>): Promise<Settings>;

  // People tracking (user-scoped)
  getPeople(userId: string): Promise<Person[]>;
  getPerson(userId: string, name: string): Promise<Person | undefined>;
  getPersonById(userId: string, id: string): Promise<Person | undefined>;
  getActivePeopleCount(userId: string): Promise<number>;
  getHighPriorityPeople(userId: string, minPriority?: number): Promise<Person[]>;
  upsertPerson(userId: string, name: string, source?: 'memory' | 'messages' | 'manual', phoneNumber?: string): Promise<Person>;
  getPersonByPhone(userId: string, phoneNumber: string): Promise<Person | undefined>;
  updatePerson(userId: string, id: string, data: Partial<InsertPerson>): Promise<Person | undefined>;
  deletePerson(userId: string, id: string): Promise<boolean>;
  mergePersonRecords(userId: string, target: Person, source: Person, updateData: Partial<InsertPerson>): Promise<Person>;
  mergePeople(userId: string, targetId: string, sourceIds: string[]): Promise<{ merged: number; updatedMemories: number }>;
  getPersonMentions(userId: string, personName: string, aliases?: string[]): Promise<LogEntry[]>;
  
  // Mood analytics (user-scoped)
  getMoodStats(userId: string, days?: number): Promise<{ mood: string; count: number; avgScore: number }[]>;
  getEntriesByMood(userId: string, mood: string): Promise<LogEntry[]>;
  getMoodTrend(userId: string, days?: number, userTimezone?: string): Promise<{ date: string; avgScore: number; count: number }[]>;
  getTopicFrequency(userId: string, days?: number): Promise<{ topic: string; count: number }[]>;
  getMemoriesPerDay(userId: string, days?: number, userTimezone?: string): Promise<{ date: string; count: number }[]>;
  
  // Time capsule - memories from this day in previous years
  getOnThisDayMemories(userId: string, userTimezone?: string): Promise<LogEntry[]>;
  
  // AI Actions (user-scoped)
  getAiActions(userId: string, status?: string[], limit?: number, offset?: number, since?: Date): Promise<AiAction[]>;
  getAiActionsCount(userId: string, status?: string[], since?: Date): Promise<number>;
  getAiAction(id: string, userId: string): Promise<AiAction | undefined>;
  createAiAction(action: InsertAiAction): Promise<AiAction>;
  updateAiAction(id: string, userId: string, updates: Partial<InsertAiAction>): Promise<AiAction | undefined>;
  markActionRolledBack(id: string, userId: string): Promise<AiAction | undefined>;
  getPendingActions(userId: string): Promise<AiAction[]>;
  getRecentRejectedActionsWithReasons(userId: string, limit?: number): Promise<AiAction[]>;
  resolvePendingActionsBySource(userId: string, sourceId: string, actionType?: string, resolution?: 'completed' | 'rejected'): Promise<number>;
  
  // AI Action Preferences (user-scoped)
  getAiActionPreferences(userId: string): Promise<AiActionPreference[]>;
  getAiActionPreference(userId: string, actionType: string): Promise<AiActionPreference | undefined>;
  upsertAiActionPreference(userId: string, actionType: string, policy: string, conditions?: any): Promise<AiActionPreference>;

  // AI Cache (performance optimization)
  getAiCache(userId: string, cacheType: string, cacheKey: string): Promise<AiCache | undefined>;
  setAiCache(userId: string, cacheType: string, cacheKey: string, data: any, memoriesHash: string, memoriesCount: number, ttlMinutes?: number): Promise<AiCache>;
  invalidateAiCache(userId: string, cacheType?: string): Promise<void>;
  getLatestMemoryTimestamp(userId: string): Promise<Date | null>;

  // Ideas (user-scoped)
  getIdeas(userId: string, stage?: string, type?: string): Promise<Idea[]>;
  getIdea(id: string, userId: string): Promise<Idea | undefined>;
  createIdea(userId: string, idea: InsertIdea): Promise<Idea>;
  updateIdea(id: string, userId: string, updates: Partial<InsertIdea & { chatHistory: IdeaChatMessage[] }>): Promise<Idea | undefined>;
  deleteIdea(id: string, userId: string): Promise<boolean>;
  addIdeaChatMessage(id: string, userId: string, message: IdeaChatMessage): Promise<Idea | undefined>;
  
  // Idea Tasks (user-scoped via idea ownership)
  getIdeaTasks(ideaId: string): Promise<IdeaTask[]>;
  createIdeaTask(task: InsertIdeaTask): Promise<IdeaTask>;
  updateIdeaTask(id: string, updates: Partial<InsertIdeaTask>): Promise<IdeaTask | undefined>;
  deleteIdeaTask(id: string): Promise<boolean>;
  reorderIdeaTasks(ideaId: string, taskIds: string[]): Promise<void>;

  // Location History (user-scoped)
  getLocationHistory(userId: string, limit?: number, offset?: number): Promise<LocationHistory[]>;
  getLocationHistoryCount(userId: string): Promise<number>;
  getLocationHistoryInRange(userId: string, startDate: Date, endDate: Date, limit?: number): Promise<LocationHistory[]>;
  getRecentLocations(userId: string, daysBack: number, limit?: number): Promise<LocationHistory[]>;
  createLocationHistoryBatch(locations: InsertLocationHistory[]): Promise<number>;
  deleteLocationHistoryBatch(userId: string, importBatchId: string): Promise<number>;
  deleteAllLocationHistory(userId: string): Promise<number>;

  // Frequent Places (user-scoped)
  getFrequentPlaces(userId: string): Promise<FrequentPlace[]>;
  getFrequentPlace(id: string, userId: string): Promise<FrequentPlace | undefined>;
  getFrequentPlaceByLabel(userId: string, label: string): Promise<FrequentPlace | undefined>;
  createFrequentPlace(place: InsertFrequentPlace): Promise<FrequentPlace>;
  updateFrequentPlace(id: string, userId: string, updates: Partial<InsertFrequentPlace>): Promise<FrequentPlace | undefined>;
  deleteFrequentPlace(id: string, userId: string): Promise<boolean>;
  upsertFrequentPlaces(places: InsertFrequentPlace[]): Promise<number>;
  deduplicateFrequentPlaces(userId: string): Promise<{ merged: number; remaining: number }>;

  // Push Subscriptions (user-scoped)
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined>;
  createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  updatePushSubscriptionLastUsed(id: string): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<boolean>;
  deleteAllPushSubscriptions(userId: string): Promise<number>;

  // Goals (user-scoped)
  getGoals(userId: string, status?: string): Promise<Goal[]>;
  getGoal(id: string, userId: string): Promise<Goal | undefined>;
  createGoal(userId: string, goal: InsertGoal): Promise<Goal>;
  updateGoal(id: string, userId: string, updates: Partial<InsertGoal & { milestones: GoalMilestone[], aiSummary: string, aiLastAnalyzed: Date, relatedMemoryIds: string[] }>): Promise<Goal | undefined>;
  deleteGoal(id: string, userId: string): Promise<boolean>;
  getActiveGoals(userId: string): Promise<Goal[]>;

  // Reminders (user-scoped)
  getReminders(userId: string, status?: string): Promise<Reminder[]>;
  getReminder(id: string, userId: string): Promise<Reminder | undefined>;
  createReminder(userId: string, reminder: InsertReminder): Promise<Reminder>;
  updateReminder(id: string, userId: string, updates: Partial<Reminder>): Promise<Reminder | undefined>;
  deleteReminder(id: string, userId: string): Promise<boolean>;
  getPendingTimeReminders(userId: string, beforeTime: Date): Promise<Reminder[]>;
  getPendingLocationReminders(userId: string): Promise<Reminder[]>;
  triggerReminder(id: string, userId: string): Promise<Reminder | undefined>;
  completeReminder(id: string, userId: string): Promise<Reminder | undefined>;
  snoozeReminder(id: string, userId: string, until: Date): Promise<Reminder | undefined>;
  unsnoozeReminder(id: string, userId: string): Promise<Reminder | undefined>;
  dismissReminder(id: string, userId: string): Promise<Reminder | undefined>;
  getAllDueReminders(now: Date): Promise<Reminder[]>;
  getAdvanceWarningReminders(now: Date, windowMinutes: number): Promise<Reminder[]>;
  markAdvanceNotified(id: string): Promise<void>;

  // Message Conversations (user-scoped)
  getMessageConversations(userId: string, limit?: number, offset?: number): Promise<MessageConversation[]>;
  getMessageConversation(id: string, userId: string): Promise<MessageConversation | undefined>;
  getMessageConversationByContact(userId: string, contactAddress: string, platform: string): Promise<MessageConversation | undefined>;
  upsertMessageConversation(conversation: InsertMessageConversation): Promise<MessageConversation>;
  updateConversationContactName(id: string, userId: string, contactName: string): Promise<MessageConversation | undefined>;
  getMessageConversationsCount(userId: string): Promise<number>;

  // Messages (user-scoped)
  getMessages(userId: string, conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  getMessagesCount(userId: string, conversationId?: string): Promise<number>;
  getRecentMessages(userId: string, daysBack: number, limit?: number): Promise<Message[]>;
  getMessagesByDateRange(userId: string, startDate: Date, endDate: Date, limit?: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  createMessagesBatch(messages: InsertMessage[]): Promise<number>;
  getUnprocessedMessages(userId: string, limit?: number): Promise<Message[]>;
  getMessageProcessingStatus(userId: string): Promise<{ total: number; processed: number; unprocessed: number }>;
  markMessagesProcessed(messageIds: string[], updates: Partial<InsertMessage>[]): Promise<void>;
  messageExistsByExternalId(userId: string, externalId: string, source: string): Promise<boolean>;
  searchMessages(userId: string, queryVector: number[], limit?: number): Promise<Array<Message & { similarity: number }>>;

  // Message Imports (user-scoped)
  getMessageImports(userId: string): Promise<MessageImport[]>;
  createMessageImport(importRecord: InsertMessageImport): Promise<MessageImport>;
  updateMessageImport(id: string, userId: string, updates: Partial<MessageImport>): Promise<MessageImport | undefined>;

  // Message cleanup & merge
  deleteConversationRelayMessages(userId: string, conversationId: string): Promise<number>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  mergeConversations(userId: string, targetId: string, sourceIds: string[]): Promise<{ merged: number; movedMessages: number }>;

  // Relay API
  getUserByRelayApiKey(apiKey: string): Promise<User | undefined>;
  getRelayDestinations(userId: string): Promise<RelayDestination[]>;
  createRelayDestination(data: InsertRelayDestination): Promise<RelayDestination>;
  updateRelayDestination(id: string, userId: string, updates: Partial<InsertRelayDestination>): Promise<RelayDestination | undefined>;
  deleteRelayDestination(id: string, userId: string): Promise<boolean>;
  createRelayEvent(data: InsertRelayEvent): Promise<RelayEvent>;
  getRelayEvents(userId: string, limit?: number): Promise<RelayEvent[]>;

  // Automation Rules
  getAutomationRules(userId: string): Promise<AutomationRule[]>;
  getAutomationRule(id: string, userId: string): Promise<AutomationRule | undefined>;
  getEnabledRulesByTrigger(userId: string, triggerType: string): Promise<AutomationRule[]>;
  createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule>;
  updateAutomationRule(id: string, userId: string, data: Partial<InsertAutomationRule>): Promise<AutomationRule>;
  deleteAutomationRule(id: string, userId: string): Promise<void>;
  recordRuleExecution(id: string, userId: string, success: boolean, error?: string, chainDepth?: number): Promise<void>;
  countRuleRunsToday(id: string, userId: string): Promise<number>;

  // Profile Observations
  getProfileObservations(userId: string, status?: string): Promise<ProfileObservation[]>;
  createProfileObservation(data: InsertProfileObservation): Promise<ProfileObservation>;
  updateProfileObservationStatus(id: string, userId: string, status: string): Promise<ProfileObservation | undefined>;
  getConfirmedObservationsText(userId: string, limit?: number): Promise<string>;
  getConfirmedObservationsCount(userId: string): Promise<number>;
  archiveOldestConfirmedObservation(userId: string): Promise<string | null>;
  expireOldPendingObservations(userId: string): Promise<void>;

  // AI Chat Sessions & Messages
  getAiChatSessions(userId: string): Promise<AiChatSession[]>;
  getAiChatSession(id: string, userId: string): Promise<AiChatSession | undefined>;
  createAiChatSession(userId: string, title?: string): Promise<AiChatSession>;
  updateAiChatSession(id: string, userId: string, updates: { title?: string; lastMessageAt?: Date; messageCount?: number }): Promise<AiChatSession | undefined>;
  deleteAiChatSession(id: string, userId: string): Promise<boolean>;
  getAiChatMessages(sessionId: string, userId: string): Promise<AiChatMessage[]>;
  getAiChatMessage(id: string, userId: string): Promise<AiChatMessage | undefined>;
  createAiChatMessage(data: { sessionId: string; userId: string; role: string; content: string }): Promise<AiChatMessage>;
  markAiChatMessageSaved(id: string, userId: string, savedAs: 'ecosystem' | 'memory'): Promise<AiChatMessage | undefined>;
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

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    try {
      const [updated] = await db
        .update(users)
        .set(data)
        .where(eq(users.id, id))
        .returning();
      if (!updated) throw new Error('User not found');
      return updated;
    } catch (error) {
      console.error('Error updating user:', error);
      throw new Error(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMonthlyMemoryCount(userId: string, since: Date): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(logEntries)
        .where(and(eq(logEntries.userId, userId), gte(logEntries.timestamp, since)));
      return result[0]?.count ?? 0;
    } catch (error) {
      console.error('Error getting monthly memory count:', error);
      throw new Error(`Failed to get monthly memory count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId));
      return user || undefined;
    } catch (error) {
      console.error('Error fetching user by Stripe customer ID:', error);
      throw new Error(`Failed to retrieve user by Stripe customer ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async countFoundingMembers(): Promise<number> {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(isNotNull(users.stripeSubscriptionId));
      return result?.count ?? 0;
    } catch (error) {
      console.error('Error counting founding members:', error);
      return 0;
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
   * Retrieve log entries from the last N days with DB-level filtering
   * More efficient than fetching all and filtering in memory
   */
  async getRecentLogEntries(userId: string, daysBack: number, limit = 100): Promise<LogEntry[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      
      return await db
        .select()
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          gte(logEntries.timestamp, cutoffDate)
        ))
        .orderBy(desc(logEntries.timestamp))
        .limit(limit);
    } catch (error) {
      console.error('Failed to fetch recent log entries:', error);
      throw new Error('Database error while fetching recent log entries');
    }
  }

  /**
   * OPTIMIZED: Fetch recent log entries with only fields needed for AI prompts
   * Excludes heavy fields: embeddingVector, metadataJson
   */
  async getRecentLogEntriesLight(userId: string, daysBack: number, limit = 100): Promise<Partial<LogEntry>[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      
      return await db
        .select({
          id: logEntries.id,
          memoryText: logEntries.memoryText,
          topicTag: logEntries.topicTag,
          mood: logEntries.mood,
          moodScore: logEntries.moodScore,
          importance: logEntries.importance,
          detectedPeople: logEntries.detectedPeople,
          timestamp: logEntries.timestamp,
          geoPlaceName: logEntries.geoPlaceName,
        })
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          gte(logEntries.timestamp, cutoffDate)
        ))
        .orderBy(desc(logEntries.timestamp))
        .limit(limit);
    } catch (error) {
      console.error('Failed to fetch recent log entries (light):', error);
      throw new Error('Database error while fetching recent log entries');
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
    _topicTag?: string,
    timestampStart?: Date,
    timestampEnd?: Date,
    metadataFilters?: Record<string, any>,
    limit = 10
  ): Promise<Array<Partial<LogEntry> & { similarity: number }>> {
    try {
      // Build the WHERE clause conditions - always include userId filter
      // NOTE: topicTag is intentionally NOT used as a hard SQL filter — it would eliminate
      // semantically relevant results if the AI guessed the wrong tag. Vector similarity
      // handles relevance; topic tags are shown in results only.
      const conditions: any[] = [
        eq(logEntries.userId, userId),
        sql`${logEntries.embeddingVector} IS NOT NULL`,
      ];

      if (timestampStart) {
        conditions.push(gte(logEntries.timestamp, timestampStart));
      }

      if (timestampEnd) {
        conditions.push(lte(logEntries.timestamp, timestampEnd));
      }

      // Build metadata JSON filter conditions
      if (metadataFilters && Object.keys(metadataFilters).length > 0) {
        for (const [key, value] of Object.entries(metadataFilters)) {
          conditions.push(sql`${logEntries.metadataJson}->>'${sql.raw(key)}' = ${value}`);
        }
      }

      // Convert query vector to pgvector format
      const vectorString = `[${queryVector.join(',')}]`;

      // Perform pure vector similarity search
      // Note: embeddingVector is excluded from results for performance (1536 floats per record)
      const result = await db
        .select({
          id: logEntries.id,
          userId: logEntries.userId,
          memoryText: logEntries.memoryText,
          topicTag: logEntries.topicTag,
          mood: logEntries.mood,
          moodScore: logEntries.moodScore,
          detectedPeople: logEntries.detectedPeople,
          metadataJson: logEntries.metadataJson,
          timestamp: logEntries.timestamp,
          calendarEventId: logEntries.calendarEventId,
          calendarEventTitle: logEntries.calendarEventTitle,
          geoPlaceName: logEntries.geoPlaceName,
          similarity: sql<number>`1 - (${logEntries.embeddingVector} <=> ${vectorString}::vector)`,
        })
        .from(logEntries)
        .where(and(...conditions))
        .orderBy(sql`${logEntries.embeddingVector} <=> ${vectorString}::vector`)
        .limit(limit);

      return result as Array<Partial<LogEntry> & { similarity: number }>;
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

  /**
   * Get count of people with at least one mention (lightweight query)
   */
  async getActivePeopleCount(userId: string): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(people)
        .where(and(
          eq(people.userId, userId),
          sql`${people.mentionCount} > 0`
        ));
      return result[0]?.count ?? 0;
    } catch (error) {
      console.error('Failed to count active people:', error);
      throw new Error('Database error while counting active people');
    }
  }

  /**
   * Get high-priority people (for high-signal alerts)
   * Default minimum priority is 8 (high importance)
   */
  async getHighPriorityPeople(userId: string, minPriority: number = 8): Promise<Person[]> {
    try {
      const result = await db
        .select()
        .from(people)
        .where(and(
          eq(people.userId, userId),
          sql`${people.priority} >= ${minPriority}`
        ))
        .orderBy(desc(people.priority));
      return result;
    } catch (error) {
      console.error('Failed to fetch high-priority people:', error);
      throw new Error('Database error while fetching high-priority people');
    }
  }

  async upsertPerson(userId: string, name: string, source: 'memory' | 'messages' | 'manual' = 'memory', phoneNumber?: string): Promise<Person> {
    try {
      let existing: Person | undefined;
      if (phoneNumber) {
        existing = await this.getPersonByPhone(userId, phoneNumber);
      }
      if (!existing) {
        existing = await this.getPerson(userId, name);
      }
      if (!existing) {
        const [aliasMatch] = await db.select().from(people)
          .where(and(
            eq(people.userId, userId),
            sql`${name} = ANY(${people.aliases})`
          ))
          .limit(1);
        if (aliasMatch) {
          existing = aliasMatch;
        }
      }
      
      if (existing) {
        const newSource = existing.source !== source && existing.source !== 'both' && source !== 'manual'
          ? 'both'
          : existing.source;
        const updates: Record<string, any> = {
          mentionCount: sql`${people.mentionCount} + 1`,
          lastMentioned: new Date(),
          ...(newSource !== existing.source ? { source: newSource } : {}),
        };
        if (phoneNumber && !existing.phoneNumber) {
          updates.phoneNumber = phoneNumber;
        }
        const isPhoneNumberName = /^\+?\d[\d\s\-()]+$/.test(existing.name);
        if (name !== existing.name && isPhoneNumberName) {
          updates.name = name;
        }
        const [updated] = await db
          .update(people)
          .set(updates)
          .where(and(eq(people.userId, userId), eq(people.id, existing.id)))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(people)
          .values({ userId, name, mentionCount: 1, source, ...(phoneNumber ? { phoneNumber } : {}) })
          .returning();
        return created;
      }
    } catch (error) {
      console.error('Failed to upsert person:', error);
      throw new Error('Database error while upserting person');
    }
  }

  async getPersonByPhone(userId: string, phoneNumber: string): Promise<Person | undefined> {
    try {
      const [person] = await db.select().from(people)
        .where(and(eq(people.userId, userId), eq(people.phoneNumber, phoneNumber)));
      return person;
    } catch (error) {
      console.error('Failed to get person by phone:', error);
      throw new Error('Database error while fetching person by phone');
    }
  }

  async getPersonById(userId: string, id: string): Promise<Person | undefined> {
    try {
      const [person] = await db.select().from(people)
        .where(and(eq(people.userId, userId), eq(people.id, id)));
      return person;
    } catch (error) {
      console.error('Failed to get person by id:', error);
      throw new Error('Database error while fetching person by id');
    }
  }

  async updatePerson(userId: string, id: string, data: Partial<InsertPerson>): Promise<Person | undefined> {
    try {
      let finalData: Record<string, any> = { ...data };

      const current = await this.getPersonById(userId, id);
      if (current) {
        const isRename = data.name && data.name !== current.name;
        const userSuppliedAliases: string[] = data.aliases !== undefined ? (data.aliases ?? []) : (current.aliases ?? []);
        const aliasSet = new Set(userSuppliedAliases);
        if (isRename) {
          aliasSet.add(current.name);
          aliasSet.delete(data.name!);
        }
        finalData.aliases = Array.from(aliasSet);
      }

      const [updated] = await db
        .update(people)
        .set(finalData)
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

  async mergePersonRecords(userId: string, target: Person, source: Person, updateData: Partial<InsertPerson>): Promise<Person> {
    try {
      const mergeUpdates: Record<string, any> = {};

      mergeUpdates.phoneNumber = target.phoneNumber || source.phoneNumber;

      mergeUpdates.relationship = updateData.relationship || target.relationship || source.relationship;

      const allNotes = [target.notes, source.notes, updateData.notes].filter(Boolean);
      mergeUpdates.notes = allNotes.length > 0 ? allNotes.join('\n') : null;

      const targetPri = target.priority ?? 5;
      const sourcePri = source.priority ?? 5;
      const updatePri = updateData.priority;
      if (updatePri && updatePri !== 5) {
        mergeUpdates.priority = updatePri;
      } else {
        mergeUpdates.priority = Math.max(targetPri, sourcePri);
      }

      if (target.source !== source.source) {
        mergeUpdates.source = 'both';
      }

      const combinedAliases = new Set([
        ...(target.aliases || []),
        ...(source.aliases || []),
        source.name,
      ]);
      combinedAliases.delete(target.name);
      mergeUpdates.aliases = Array.from(combinedAliases);

      mergeUpdates.mentionCount = (target.mentionCount || 0) + (source.mentionCount || 0);

      if (source.lastMentioned && (!target.lastMentioned || source.lastMentioned > target.lastMentioned)) {
        mergeUpdates.lastMentioned = source.lastMentioned;
      }
      if (source.firstMentioned && (!target.firstMentioned || source.firstMentioned < target.firstMentioned)) {
        mergeUpdates.firstMentioned = source.firstMentioned;
      }

      const [merged] = await db
        .update(people)
        .set(mergeUpdates)
        .where(and(eq(people.userId, userId), eq(people.id, target.id)))
        .returning();

      await db
        .delete(people)
        .where(and(eq(people.userId, userId), eq(people.id, source.id)));

      return merged;
    } catch (error) {
      console.error('Failed to merge person records:', error);
      throw new Error('Database error while merging person records');
    }
  }

  async mergePeople(userId: string, targetId: string, sourceIds: string[]): Promise<{ merged: number; updatedMemories: number }> {
    try {
      const targetPerson = await db
        .select()
        .from(people)
        .where(and(eq(people.userId, userId), eq(people.id, targetId)))
        .limit(1);
      
      if (!targetPerson[0]) {
        throw new Error('Target person not found');
      }
      
      const sourcePeople = await db
        .select()
        .from(people)
        .where(and(
          eq(people.userId, userId),
          inArray(people.id, sourceIds)
        ));
      
      if (sourcePeople.length === 0) {
        throw new Error('No source people found');
      }
      
      const targetName = targetPerson[0].name;
      const sourceNames = sourcePeople.map(p => p.name);

      const existingAliases: string[] = targetPerson[0].aliases || [];
      const allSourceAliases = sourcePeople.flatMap(p => p.aliases || []);
      const combinedAliases = new Set([...existingAliases, ...allSourceAliases, ...sourceNames]);
      combinedAliases.delete(targetName);
      await db
        .update(people)
        .set({ aliases: Array.from(combinedAliases) })
        .where(and(eq(people.userId, userId), eq(people.id, targetId)));
      
      let updatedMemories = 0;
      
      for (const sourceName of sourceNames) {
        const memoriesWithSource = await db
          .select()
          .from(logEntries)
          .where(and(
            eq(logEntries.userId, userId),
            sql`${sourceName} = ANY(${logEntries.detectedPeople})`
          ));
        
        for (const memory of memoriesWithSource) {
          const currentPeople = memory.detectedPeople || [];
          const updatedPeople = currentPeople
            .filter(name => name !== sourceName)
            .filter(name => name !== targetName);
          updatedPeople.push(targetName);
          const uniquePeople = Array.from(new Set(updatedPeople));
          
          await db
            .update(logEntries)
            .set({ detectedPeople: uniquePeople })
            .where(eq(logEntries.id, memory.id));
          updatedMemories++;
        }
      }
      
      await db
        .delete(people)
        .where(and(
          eq(people.userId, userId),
          inArray(people.id, sourceIds)
        ));
      
      await this.syncPeopleMentionCounts(userId);
      
      return { merged: sourcePeople.length, updatedMemories };
    } catch (error) {
      console.error('Failed to merge people:', error);
      throw new Error('Database error while merging people');
    }
  }

  async getPersonMentions(userId: string, personName: string, aliases?: string[]): Promise<LogEntry[]> {
    try {
      const allNames = [personName, ...(aliases || [])];
      const nameConditions = allNames.map(n => sql`${n} = ANY(${logEntries.detectedPeople})`);
      const nameCondition = nameConditions.length === 1
        ? nameConditions[0]
        : sql`(${sql.join(nameConditions, sql` OR `)})`;

      return await db
        .select()
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          nameCondition
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
        // Count actual memories mentioning this person (including aliases)
        const mentions = await this.getPersonMentions(userId, person.name, person.aliases || []);
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
  async getMoodTrend(userId: string, days = 30, userTimezone?: string): Promise<{ date: string; avgScore: number; count: number }[]> {
    try {
      const tz = userTimezone || 'America/Denver';
      // Use sql.raw() so the timezone appears as a literal string in SELECT, GROUP BY, and ORDER BY.
      // Drizzle parameterizes template ${tz} differently in each clause, causing PostgreSQL grouping errors.
      const tzLiteral = sql.raw(`'${tz.replace(/'/g, "''")}'`);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await db
        .select({
          date: sql<string>`(date_trunc('day', ${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral}))::date::text`,
          avgScore: sql<number>`avg(${logEntries.moodScore})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          gte(logEntries.timestamp, startDate),
          sql`${logEntries.moodScore} IS NOT NULL`
        ))
        .groupBy(sql`date_trunc('day', ${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral})`)
        .orderBy(sql`date_trunc('day', ${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral})`);

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
   * Get per-day memory count for area chart visualization
   */
  async getMemoriesPerDay(userId: string, days = 30, userTimezone?: string): Promise<{ date: string; count: number }[]> {
    try {
      const tz = userTimezone || 'America/Denver';
      const tzLiteral = sql.raw(`'${tz.replace(/'/g, "''")}'`);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await db
        .select({
          date: sql<string>`(date_trunc('day', ${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral}))::date::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          gte(logEntries.timestamp, startDate)
        ))
        .groupBy(sql`date_trunc('day', ${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral})`)
        .orderBy(sql`date_trunc('day', ${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral})`);

      return result.map(r => ({ date: r.date, count: r.count }));
    } catch (error) {
      console.error('Failed to fetch memories per day:', error);
      throw new Error('Database error while fetching memories per day');
    }
  }

  /**
   * TIME CAPSULE METHODS
   * Surface memories from this day in previous years
   */

  async getOnThisDayMemories(userId: string, userTimezone?: string): Promise<LogEntry[]> {
    try {
      const tz = userTimezone || 'America/Denver';
      const now = new Date();
      const month = parseInt(now.toLocaleString('en-US', { timeZone: tz, month: 'numeric' }));
      const day   = parseInt(now.toLocaleString('en-US', { timeZone: tz, day: 'numeric' }));
      const currentYear = parseInt(now.toLocaleString('en-US', { timeZone: tz, year: 'numeric' }));

      return await db
        .select()
        .from(logEntries)
        .where(and(
          eq(logEntries.userId, userId),
          sql`EXTRACT(MONTH FROM (${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})) = ${month}`,
          sql`EXTRACT(DAY   FROM (${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})) = ${day}`,
          sql`EXTRACT(YEAR  FROM (${logEntries.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})) < ${currentYear}`
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

  async getAiActions(userId: string, status?: string[], limit = 50, offset = 0, since?: Date): Promise<AiAction[]> {
    try {
      const conditions = [eq(aiActions.userId, userId)];
      if (status && status.length > 0) {
        conditions.push(inArray(aiActions.status, status));
      }
      if (since) {
        conditions.push(gte(aiActions.createdAt, since));
      }
      
      return await db
        .select()
        .from(aiActions)
        .where(and(...conditions))
        .orderBy(desc(aiActions.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error('Failed to fetch AI actions:', error);
      throw new Error('Database error while fetching AI actions');
    }
  }

  async getAiActionsCount(userId: string, status?: string[], since?: Date): Promise<number> {
    try {
      const conditions = [eq(aiActions.userId, userId)];
      if (status && status.length > 0) {
        conditions.push(inArray(aiActions.status, status));
      }
      if (since) {
        conditions.push(gte(aiActions.createdAt, since));
      }
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiActions)
        .where(and(...conditions));
      return row?.count ?? 0;
    } catch (error) {
      console.error('Failed to count AI actions:', error);
      return 0;
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

  async markActionRolledBack(id: string, userId: string): Promise<AiAction | undefined> {
    try {
      const [updated] = await db
        .update(aiActions)
        .set({ rolledBackAt: new Date(), updatedAt: new Date() })
        .where(and(eq(aiActions.id, id), eq(aiActions.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to mark action as rolled back:', error);
      throw new Error('Database error while rolling back AI action');
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

  async getRecentRejectedActionsWithReasons(userId: string, limit = 20): Promise<AiAction[]> {
    try {
      return await db
        .select()
        .from(aiActions)
        .where(and(
          eq(aiActions.userId, userId),
          eq(aiActions.status, 'rejected'),
          isNotNull(aiActions.rejectionReason)
        ))
        .orderBy(desc(aiActions.updatedAt))
        .limit(limit);
    } catch (error) {
      console.error('Failed to fetch rejected actions with reasons:', error);
      return [];
    }
  }

  async resolvePendingActionsBySource(userId: string, sourceId: string, actionType?: string, resolution: 'completed' | 'rejected' = 'completed'): Promise<number> {
    try {
      const conditions = [
        eq(aiActions.userId, userId),
        eq(aiActions.status, 'pending'),
        eq(aiActions.sourceId, sourceId),
      ];
      if (actionType) {
        conditions.push(eq(aiActions.actionType, actionType));
      }
      const result = await db
        .update(aiActions)
        .set({ status: resolution, executedAt: new Date() })
        .where(and(...conditions))
        .returning();
      return result.length;
    } catch (error) {
      console.error('Failed to resolve pending actions by source:', error);
      return 0;
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

  /**
   * AI CACHE METHODS
   * Performance optimization: cache AI-generated content to avoid regenerating on every request
   */

  async getAiCache(userId: string, cacheType: string, cacheKey: string): Promise<AiCache | undefined> {
    try {
      const [cached] = await db
        .select()
        .from(aiCache)
        .where(and(
          eq(aiCache.userId, userId),
          eq(aiCache.cacheType, cacheType),
          eq(aiCache.cacheKey, cacheKey),
          gte(aiCache.expiresAt, new Date())
        ));
      return cached;
    } catch (error) {
      console.error('Failed to fetch AI cache:', error);
      return undefined; // Don't throw - cache miss is acceptable
    }
  }

  async setAiCache(
    userId: string, 
    cacheType: string, 
    cacheKey: string, 
    data: any, 
    memoriesHash: string, 
    memoriesCount: number, 
    ttlMinutes = 30
  ): Promise<AiCache> {
    try {
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      
      // Upsert the cache entry
      const [cached] = await db
        .insert(aiCache)
        .values({
          userId,
          cacheType,
          cacheKey,
          data,
          memoriesHash,
          memoriesCount,
          expiresAt
        })
        .onConflictDoUpdate({
          target: [aiCache.userId, aiCache.cacheType, aiCache.cacheKey],
          set: {
            data,
            memoriesHash,
            memoriesCount,
            generatedAt: new Date(),
            expiresAt
          }
        })
        .returning();
      
      return cached;
    } catch (error) {
      console.error('Failed to set AI cache:', error);
      throw new Error('Database error while setting AI cache');
    }
  }

  async invalidateAiCache(userId: string, cacheType?: string): Promise<void> {
    try {
      if (cacheType) {
        await db
          .delete(aiCache)
          .where(and(
            eq(aiCache.userId, userId),
            eq(aiCache.cacheType, cacheType)
          ));
      } else {
        await db
          .delete(aiCache)
          .where(eq(aiCache.userId, userId));
      }
    } catch (error) {
      console.error('Failed to invalidate AI cache:', error);
      // Don't throw - cache invalidation failure is non-critical
    }
  }

  async getLatestMemoryTimestamp(userId: string): Promise<Date | null> {
    try {
      const [result] = await db
        .select({ timestamp: logEntries.timestamp })
        .from(logEntries)
        .where(eq(logEntries.userId, userId))
        .orderBy(desc(logEntries.timestamp))
        .limit(1);
      return result?.timestamp || null;
    } catch (error) {
      console.error('Failed to get latest memory timestamp:', error);
      return null;
    }
  }

  /**
   * IDEAS MANAGEMENT METHODS
   * Handle user ideas through various stages of development
   */

  async getIdeas(userId: string, stage?: string, type?: string): Promise<Idea[]> {
    try {
      const conditions = [eq(ideas.userId, userId)];
      if (stage) {
        conditions.push(eq(ideas.stage, stage));
      }
      if (type) {
        conditions.push(eq(ideas.type, type));
      }
      return await db
        .select()
        .from(ideas)
        .where(and(...conditions))
        .orderBy(desc(ideas.updatedAt));
    } catch (error) {
      console.error('Failed to get ideas:', error);
      throw new Error('Database error while fetching ideas');
    }
  }

  async getIdea(id: string, userId: string): Promise<Idea | undefined> {
    try {
      const [idea] = await db
        .select()
        .from(ideas)
        .where(and(eq(ideas.id, id), eq(ideas.userId, userId)));
      return idea || undefined;
    } catch (error) {
      console.error('Failed to get idea:', error);
      throw new Error('Database error while fetching idea');
    }
  }

  async createIdea(userId: string, idea: InsertIdea): Promise<Idea> {
    try {
      const [newIdea] = await db
        .insert(ideas)
        .values({
          ...idea,
          userId,
          chatHistory: [],
        })
        .returning();
      return newIdea;
    } catch (error) {
      console.error('Failed to create idea:', error);
      throw new Error('Database error while creating idea');
    }
  }

  async updateIdea(id: string, userId: string, updates: Partial<InsertIdea & { chatHistory: IdeaChatMessage[] }>): Promise<Idea | undefined> {
    try {
      const [updated] = await db
        .update(ideas)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(and(eq(ideas.id, id), eq(ideas.userId, userId)))
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error('Failed to update idea:', error);
      throw new Error('Database error while updating idea');
    }
  }

  async deleteIdea(id: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(ideas)
        .where(and(eq(ideas.id, id), eq(ideas.userId, userId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete idea:', error);
      throw new Error('Database error while deleting idea');
    }
  }

  async addIdeaChatMessage(id: string, userId: string, message: IdeaChatMessage): Promise<Idea | undefined> {
    try {
      // First get the current idea to append to chat history
      const idea = await this.getIdea(id, userId);
      if (!idea) return undefined;

      const currentHistory = (idea.chatHistory as IdeaChatMessage[]) || [];
      const updatedHistory = [...currentHistory, message];

      const [updated] = await db
        .update(ideas)
        .set({
          chatHistory: updatedHistory,
          updatedAt: new Date(),
        })
        .where(and(eq(ideas.id, id), eq(ideas.userId, userId)))
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error('Failed to add chat message to idea:', error);
      throw new Error('Database error while adding chat message');
    }
  }

  /**
   * IDEA TASKS MANAGEMENT METHODS
   * Handle tasks/steps to bring ideas to reality
   */

  async getIdeaTasks(ideaId: string): Promise<IdeaTask[]> {
    try {
      return await db
        .select()
        .from(ideaTasks)
        .where(eq(ideaTasks.ideaId, ideaId))
        .orderBy(ideaTasks.order);
    } catch (error) {
      console.error('Failed to get idea tasks:', error);
      throw new Error('Database error while fetching idea tasks');
    }
  }

  async createIdeaTask(task: InsertIdeaTask): Promise<IdeaTask> {
    try {
      const [newTask] = await db
        .insert(ideaTasks)
        .values(task)
        .returning();
      return newTask;
    } catch (error) {
      console.error('Failed to create idea task:', error);
      throw new Error('Database error while creating idea task');
    }
  }

  async updateIdeaTask(id: string, updates: Partial<InsertIdeaTask>): Promise<IdeaTask | undefined> {
    try {
      const [updated] = await db
        .update(ideaTasks)
        .set(updates)
        .where(eq(ideaTasks.id, id))
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error('Failed to update idea task:', error);
      throw new Error('Database error while updating idea task');
    }
  }

  async deleteIdeaTask(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(ideaTasks)
        .where(eq(ideaTasks.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete idea task:', error);
      throw new Error('Database error while deleting idea task');
    }
  }

  async reorderIdeaTasks(ideaId: string, taskIds: string[]): Promise<void> {
    try {
      // Update order for each task based on its position in the array
      await Promise.all(
        taskIds.map((taskId, index) =>
          db
            .update(ideaTasks)
            .set({ order: index })
            .where(and(eq(ideaTasks.id, taskId), eq(ideaTasks.ideaId, ideaId)))
        )
      );
    } catch (error) {
      console.error('Failed to reorder idea tasks:', error);
      throw new Error('Database error while reordering tasks');
    }
  }

  // ============================================
  // LOCATION HISTORY METHODS
  // ============================================

  async getLocationHistory(userId: string, limit: number = 100, offset: number = 0): Promise<LocationHistory[]> {
    try {
      return await db
        .select()
        .from(locationHistory)
        .where(eq(locationHistory.userId, userId))
        .orderBy(desc(locationHistory.timestamp))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error('Failed to get location history:', error);
      throw new Error('Database error while fetching location history');
    }
  }

  async getLocationHistoryCount(userId: string): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(locationHistory)
        .where(eq(locationHistory.userId, userId));
      return result[0]?.count ?? 0;
    } catch (error) {
      console.error('Failed to count location history:', error);
      throw new Error('Database error while counting location history');
    }
  }

  async getLocationHistoryInRange(userId: string, startDate: Date, endDate: Date, limit: number = 1000): Promise<LocationHistory[]> {
    try {
      return await db
        .select()
        .from(locationHistory)
        .where(
          and(
            eq(locationHistory.userId, userId),
            gte(locationHistory.timestamp, startDate),
            lte(locationHistory.timestamp, endDate)
          )
        )
        .orderBy(desc(locationHistory.timestamp))
        .limit(limit);
    } catch (error) {
      console.error('Failed to get location history in range:', error);
      throw new Error('Database error while fetching location history in range');
    }
  }

  async getRecentLocations(userId: string, daysBack: number, limit: number = 500): Promise<LocationHistory[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      
      return await db
        .select()
        .from(locationHistory)
        .where(
          and(
            eq(locationHistory.userId, userId),
            gte(locationHistory.timestamp, startDate)
          )
        )
        .orderBy(desc(locationHistory.timestamp))
        .limit(limit);
    } catch (error) {
      console.error('Failed to get recent locations:', error);
      throw new Error('Database error while fetching recent locations');
    }
  }

  async createLocationHistory(location: InsertLocationHistory): Promise<LocationHistory> {
    try {
      const [result] = await db.insert(locationHistory).values(location).returning();
      return result;
    } catch (error) {
      console.error('Failed to create location history:', error);
      throw new Error('Database error while inserting location history');
    }
  }

  async createLocationHistoryBatch(locations: InsertLocationHistory[]): Promise<number> {
    try {
      if (locations.length === 0) return 0;
      
      const BATCH_SIZE = 500;
      let inserted = 0;
      
      for (let i = 0; i < locations.length; i += BATCH_SIZE) {
        const batch = locations.slice(i, i + BATCH_SIZE);
        const result = await db.insert(locationHistory).values(batch).returning({ id: locationHistory.id });
        inserted += result.length;
      }
      
      return inserted;
    } catch (error) {
      console.error('Failed to create location history batch:', error);
      throw new Error('Database error while inserting location history');
    }
  }

  async deleteLocationHistoryBatch(userId: string, importBatchId: string): Promise<number> {
    try {
      const result = await db
        .delete(locationHistory)
        .where(
          and(
            eq(locationHistory.userId, userId),
            eq(locationHistory.importBatchId, importBatchId)
          )
        )
        .returning({ id: locationHistory.id });
      return result.length;
    } catch (error) {
      console.error('Failed to delete location history batch:', error);
      throw new Error('Database error while deleting location history batch');
    }
  }

  async deleteAllLocationHistory(userId: string): Promise<number> {
    try {
      const result = await db
        .delete(locationHistory)
        .where(eq(locationHistory.userId, userId))
        .returning({ id: locationHistory.id });
      return result.length;
    } catch (error) {
      console.error('Failed to delete all location history:', error);
      throw new Error('Database error while deleting location history');
    }
  }

  // ============================================
  // FREQUENT PLACES METHODS
  // ============================================

  async getFrequentPlaces(userId: string): Promise<FrequentPlace[]> {
    try {
      return await db
        .select()
        .from(frequentPlaces)
        .where(eq(frequentPlaces.userId, userId))
        .orderBy(desc(frequentPlaces.visitCount));
    } catch (error) {
      console.error('Failed to get frequent places:', error);
      throw new Error('Database error while fetching frequent places');
    }
  }

  async getFrequentPlace(id: string, userId: string): Promise<FrequentPlace | undefined> {
    try {
      const [place] = await db
        .select()
        .from(frequentPlaces)
        .where(
          and(
            eq(frequentPlaces.id, id),
            eq(frequentPlaces.userId, userId)
          )
        );
      return place || undefined;
    } catch (error) {
      console.error('Failed to get frequent place:', error);
      throw new Error('Database error while fetching frequent place');
    }
  }

  async getFrequentPlaceByLabel(userId: string, label: string): Promise<FrequentPlace | undefined> {
    try {
      const [place] = await db
        .select()
        .from(frequentPlaces)
        .where(
          and(
            eq(frequentPlaces.userId, userId),
            eq(frequentPlaces.label, label)
          )
        );
      return place || undefined;
    } catch (error) {
      console.error('Failed to get frequent place by label:', error);
      throw new Error('Database error while fetching frequent place by label');
    }
  }

  async createFrequentPlace(place: InsertFrequentPlace): Promise<FrequentPlace> {
    try {
      const [newPlace] = await db
        .insert(frequentPlaces)
        .values(place)
        .returning();
      return newPlace;
    } catch (error) {
      console.error('Failed to create frequent place:', error);
      throw new Error('Database error while creating frequent place');
    }
  }

  async updateFrequentPlace(id: string, userId: string, updates: Partial<InsertFrequentPlace>): Promise<FrequentPlace | undefined> {
    try {
      const [updated] = await db
        .update(frequentPlaces)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(frequentPlaces.id, id),
            eq(frequentPlaces.userId, userId)
          )
        )
        .returning();
      return updated || undefined;
    } catch (error) {
      console.error('Failed to update frequent place:', error);
      throw new Error('Database error while updating frequent place');
    }
  }

  async deleteFrequentPlace(id: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(frequentPlaces)
        .where(
          and(
            eq(frequentPlaces.id, id),
            eq(frequentPlaces.userId, userId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete frequent place:', error);
      throw new Error('Database error while deleting frequent place');
    }
  }

  async upsertFrequentPlaces(places: InsertFrequentPlace[]): Promise<number> {
    try {
      if (places.length === 0) return 0;

      // Inline haversine — avoids circular import with location-service
      const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 6371000;
        const toRad = (d: number) => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      const MERGE_RADIUS = 200; // metres

      // Fetch existing places once so we can proximity-check without per-place queries
      const existingPlaces = await this.getFrequentPlaces(places[0].userId);

      let upserted = 0;
      for (const place of places) {
        // 1. Labeled home/work: deduplicate by label
        if (place.label && ['home', 'work'].includes(place.label)) {
          const existing = existingPlaces.find(e => e.label === place.label);
          if (existing) {
            const updated = await this.updateFrequentPlace(existing.id, place.userId, {
              visitCount: (existing.visitCount ?? 0) + (place.visitCount ?? 0),
              totalTimeMinutes: (existing.totalTimeMinutes ?? 0) + (place.totalTimeMinutes ?? 0),
              lastVisit: place.lastVisit && (!existing.lastVisit || place.lastVisit > existing.lastVisit)
                ? place.lastVisit : existing.lastVisit ?? undefined,
              firstVisit: place.firstVisit && (!existing.firstVisit || place.firstVisit < existing.firstVisit)
                ? place.firstVisit : existing.firstVisit ?? undefined,
              ...(place.address && !existing.address ? { address: place.address } : {}),
            });
            if (updated) {
              const idx = existingPlaces.findIndex(e => e.id === existing.id);
              if (idx !== -1) existingPlaces[idx] = updated;
            }
            upserted++;
            continue;
          }
        }

        // 2. All places: deduplicate by proximity (200 m radius)
        const nearby = existingPlaces.find(e =>
          haversineMeters(e.latitude, e.longitude, place.latitude, place.longitude) <= MERGE_RADIUS
        );
        if (nearby) {
          const updated = await this.updateFrequentPlace(nearby.id, place.userId, {
            visitCount: (nearby.visitCount ?? 0) + (place.visitCount ?? 0),
            totalTimeMinutes: (nearby.totalTimeMinutes ?? 0) + (place.totalTimeMinutes ?? 0),
            lastVisit: place.lastVisit && (!nearby.lastVisit || place.lastVisit > nearby.lastVisit)
              ? place.lastVisit : nearby.lastVisit ?? undefined,
            firstVisit: place.firstVisit && (!nearby.firstVisit || place.firstVisit < nearby.firstVisit)
              ? place.firstVisit : nearby.firstVisit ?? undefined,
            // Promote richer data if the existing entry is missing it
            ...(place.address && !nearby.address ? { address: place.address } : {}),
            ...(place.name && !nearby.name.startsWith('Location ') ? {} : place.name ? { name: place.name } : {}),
            ...(place.label && !nearby.label ? { label: place.label } : {}),
          });
          if (updated) {
            const idx = existingPlaces.findIndex(e => e.id === nearby.id);
            if (idx !== -1) existingPlaces[idx] = updated;
          }
          upserted++;
          continue;
        }

        // 3. Genuinely new place — insert and track for same-batch dedup
        const created = await this.createFrequentPlace(place);
        existingPlaces.push(created);
        upserted++;
      }

      return upserted;
    } catch (error) {
      console.error('Failed to upsert frequent places:', error);
      throw new Error('Database error while upserting frequent places');
    }
  }

  async deduplicateFrequentPlaces(userId: string): Promise<{ merged: number; remaining: number }> {
    try {
      const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 6371000;
        const toRad = (d: number) => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      const MERGE_RADIUS = 200;

      const allPlaces = await this.getFrequentPlaces(userId);
      const toDelete = new Set<string>();
      let mergedCount = 0;

      for (let i = 0; i < allPlaces.length; i++) {
        if (toDelete.has(allPlaces[i].id)) continue;
        const primary = allPlaces[i];

        for (let j = i + 1; j < allPlaces.length; j++) {
          if (toDelete.has(allPlaces[j].id)) continue;
          const secondary = allPlaces[j];

          const dist = haversineMeters(
            primary.latitude, primary.longitude,
            secondary.latitude, secondary.longitude
          );
          if (dist > MERGE_RADIUS) continue;

          // Skip if both places have different non-null labels — they're intentionally distinct
          if (primary.label && secondary.label && primary.label !== secondary.label) continue;

          // Keep the confirmed/labelled one as winner; if tied, primary wins
          const keepPrimary = primary.isConfirmed || !secondary.isConfirmed;
          const winner = keepPrimary ? primary : secondary;
          const loser = keepPrimary ? secondary : primary;

          const mergedVisitCount = (winner.visitCount ?? 0) + (loser.visitCount ?? 0);
          const mergedTotalTime = (winner.totalTimeMinutes ?? 0) + (loser.totalTimeMinutes ?? 0);
          const mergedLastVisit = loser.lastVisit && (!winner.lastVisit || loser.lastVisit > winner.lastVisit)
            ? loser.lastVisit : winner.lastVisit;
          const mergedFirstVisit = loser.firstVisit && (!winner.firstVisit || loser.firstVisit < winner.firstVisit)
            ? loser.firstVisit : winner.firstVisit;

          // IMPORTANT: delete the loser FIRST so its label is freed before we
          // potentially copy it onto the winner — avoids unique constraint violation
          // on (userId, label).
          await this.deleteFrequentPlace(loser.id, userId);
          toDelete.add(loser.id);

          const inheritedLabel = winner.label ?? loser.label ?? undefined;
          await this.updateFrequentPlace(winner.id, userId, {
            visitCount: mergedVisitCount,
            totalTimeMinutes: mergedTotalTime,
            lastVisit: mergedLastVisit ?? undefined,
            firstVisit: mergedFirstVisit ?? undefined,
            address: winner.address ?? loser.address ?? undefined,
            ...(inheritedLabel !== undefined ? { label: inheritedLabel } : {}),
            isConfirmed: winner.isConfirmed || loser.isConfirmed,
            name: (winner.isConfirmed && !loser.isConfirmed) ? winner.name
              : (!winner.isConfirmed && loser.isConfirmed) ? loser.name
              : winner.name,
          });

          // Update in-memory winner so subsequent passes use merged counts
          const winnerIdx = keepPrimary ? i : j;
          allPlaces[winnerIdx] = {
            ...winner,
            visitCount: mergedVisitCount,
            totalTimeMinutes: mergedTotalTime,
            label: inheritedLabel ?? null,
          } as FrequentPlace;

          mergedCount++;
        }
      }

      return { merged: mergedCount, remaining: allPlaces.length - toDelete.size };
    } catch (error) {
      console.error('Failed to deduplicate frequent places:', error);
      throw new Error('Database error while deduplicating frequent places');
    }
  }

  // Push Subscription Methods
  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    try {
      return await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
    } catch (error) {
      console.error('Failed to get push subscriptions:', error);
      throw new Error('Database error while fetching push subscriptions');
    }
  }

  async getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined> {
    try {
      const [subscription] = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      return subscription;
    } catch (error) {
      console.error('Failed to get push subscription by endpoint:', error);
      throw new Error('Database error while fetching push subscription');
    }
  }

  async createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription> {
    try {
      const [created] = await db
        .insert(pushSubscriptions)
        .values(subscription)
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            userAgent: subscription.userAgent,
          }
        })
        .returning();
      return created;
    } catch (error) {
      console.error('Failed to create push subscription:', error);
      throw new Error('Database error while creating push subscription');
    }
  }

  async updatePushSubscriptionLastUsed(id: string): Promise<void> {
    try {
      await db
        .update(pushSubscriptions)
        .set({ lastUsed: new Date() })
        .where(eq(pushSubscriptions.id, id));
    } catch (error) {
      console.error('Failed to update push subscription last used:', error);
    }
  }

  async deletePushSubscription(endpoint: string): Promise<boolean> {
    try {
      const result = await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete push subscription:', error);
      throw new Error('Database error while deleting push subscription');
    }
  }

  async deleteAllPushSubscriptions(userId: string): Promise<number> {
    try {
      const result = await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
        .returning();
      return result.length;
    } catch (error) {
      console.error('Failed to delete all push subscriptions:', error);
      throw new Error('Database error while deleting push subscriptions');
    }
  }

  // Goals implementation
  async getGoals(userId: string, status?: string): Promise<Goal[]> {
    try {
      const conditions = [eq(goals.userId, userId)];
      if (status) {
        conditions.push(eq(goals.status, status));
      }
      return await db
        .select()
        .from(goals)
        .where(and(...conditions))
        .orderBy(desc(goals.updatedAt));
    } catch (error) {
      console.error('Failed to get goals:', error);
      throw new Error('Database error while fetching goals');
    }
  }

  async getGoal(id: string, userId: string): Promise<Goal | undefined> {
    try {
      const [goal] = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, id), eq(goals.userId, userId)));
      return goal;
    } catch (error) {
      console.error('Failed to get goal:', error);
      throw new Error('Database error while fetching goal');
    }
  }

  async createGoal(userId: string, goal: InsertGoal): Promise<Goal> {
    try {
      const [created] = await db
        .insert(goals)
        .values({ ...goal, userId })
        .returning();
      return created;
    } catch (error) {
      console.error('Failed to create goal:', error);
      throw new Error('Database error while creating goal');
    }
  }

  async updateGoal(id: string, userId: string, updates: Partial<InsertGoal & { milestones: GoalMilestone[], aiSummary: string, aiLastAnalyzed: Date, relatedMemoryIds: string[] }>): Promise<Goal | undefined> {
    try {
      const [updated] = await db
        .update(goals)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(goals.id, id), eq(goals.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to update goal:', error);
      throw new Error('Database error while updating goal');
    }
  }

  async deleteGoal(id: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(goals)
        .where(and(eq(goals.id, id), eq(goals.userId, userId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete goal:', error);
      throw new Error('Database error while deleting goal');
    }
  }

  async getActiveGoals(userId: string): Promise<Goal[]> {
    try {
      return await db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
        .orderBy(desc(goals.updatedAt));
    } catch (error) {
      console.error('Failed to get active goals:', error);
      throw new Error('Database error while fetching active goals');
    }
  }

  // ============================================
  // REMINDERS METHODS
  // ============================================

  async getReminders(userId: string, status?: string): Promise<Reminder[]> {
    try {
      if (status) {
        return await db
          .select()
          .from(reminders)
          .where(and(eq(reminders.userId, userId), eq(reminders.status, status)))
          .orderBy(desc(reminders.createdAt));
      }
      return await db
        .select()
        .from(reminders)
        .where(eq(reminders.userId, userId))
        .orderBy(desc(reminders.createdAt));
    } catch (error) {
      console.error('Failed to get reminders:', error);
      throw new Error('Database error while fetching reminders');
    }
  }

  async getReminder(id: string, userId: string): Promise<Reminder | undefined> {
    try {
      const [reminder] = await db
        .select()
        .from(reminders)
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
      return reminder;
    } catch (error) {
      console.error('Failed to get reminder:', error);
      throw new Error('Database error while fetching reminder');
    }
  }

  async createReminder(userId: string, reminder: InsertReminder): Promise<Reminder> {
    try {
      const [created] = await db
        .insert(reminders)
        .values({ ...reminder, userId })
        .returning();
      return created;
    } catch (error) {
      console.error('Failed to create reminder:', error);
      throw new Error('Database error while creating reminder');
    }
  }

  async updateReminder(id: string, userId: string, updates: Partial<Reminder>): Promise<Reminder | undefined> {
    try {
      const [updated] = await db
        .update(reminders)
        .set(updates)
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to update reminder:', error);
      throw new Error('Database error while updating reminder');
    }
  }

  async deleteReminder(id: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(reminders)
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete reminder:', error);
      throw new Error('Database error while deleting reminder');
    }
  }

  async getPendingTimeReminders(userId: string, beforeTime: Date): Promise<Reminder[]> {
    try {
      return await db
        .select()
        .from(reminders)
        .where(and(
          eq(reminders.userId, userId),
          eq(reminders.triggerType, 'time'),
          eq(reminders.status, 'pending'),
          lte(reminders.triggerTime, beforeTime)
        ))
        .orderBy(reminders.triggerTime);
    } catch (error) {
      console.error('Failed to get pending time reminders:', error);
      throw new Error('Database error while fetching pending time reminders');
    }
  }

  async getPendingLocationReminders(userId: string): Promise<Reminder[]> {
    try {
      return await db
        .select()
        .from(reminders)
        .where(and(
          eq(reminders.userId, userId),
          eq(reminders.triggerType, 'location'),
          eq(reminders.status, 'pending')
        ))
        .orderBy(reminders.createdAt);
    } catch (error) {
      console.error('Failed to get pending location reminders:', error);
      throw new Error('Database error while fetching pending location reminders');
    }
  }

  async triggerReminder(id: string, userId: string): Promise<Reminder | undefined> {
    try {
      const [updated] = await db
        .update(reminders)
        .set({ status: 'triggered', triggeredAt: new Date() })
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to trigger reminder:', error);
      throw new Error('Database error while triggering reminder');
    }
  }

  async completeReminder(id: string, userId: string): Promise<Reminder | undefined> {
    try {
      const [updated] = await db
        .update(reminders)
        .set({ status: 'completed', completedAt: new Date() })
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to complete reminder:', error);
      throw new Error('Database error while completing reminder');
    }
  }

  async snoozeReminder(id: string, userId: string, until: Date): Promise<Reminder | undefined> {
    try {
      const [reminder] = await db
        .select()
        .from(reminders)
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
      
      if (!reminder) return undefined;
      
      const [updated] = await db
        .update(reminders)
        .set({ 
          status: 'snoozed', 
          snoozedUntil: until,
          snoozeCount: (reminder.snoozeCount || 0) + 1
        })
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to snooze reminder:', error);
      throw new Error('Database error while snoozing reminder');
    }
  }

  async dismissReminder(id: string, userId: string): Promise<Reminder | undefined> {
    try {
      const [updated] = await db
        .update(reminders)
        .set({ status: 'dismissed' })
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to dismiss reminder:', error);
      throw new Error('Database error while dismissing reminder');
    }
  }

  async unsnoozeReminder(id: string, userId: string): Promise<Reminder | undefined> {
    try {
      const [updated] = await db
        .update(reminders)
        .set({ status: 'pending', snoozedUntil: null })
        .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error('Failed to unsnooze reminder:', error);
      throw new Error('Database error while unsnoozing reminder');
    }
  }

  async getAllDueReminders(now: Date): Promise<Reminder[]> {
    try {
      return await db
        .select()
        .from(reminders)
        .where(or(
          and(
            eq(reminders.triggerType, 'time'),
            eq(reminders.status, 'pending'),
            lte(reminders.triggerTime, now)
          ),
          and(
            eq(reminders.status, 'snoozed'),
            lte(reminders.snoozedUntil, now)
          )
        ))
        .orderBy(reminders.triggerTime);
    } catch (error) {
      console.error('Failed to get all due reminders:', error);
      return [];
    }
  }

  async getAdvanceWarningReminders(now: Date, windowMinutes: number): Promise<Reminder[]> {
    try {
      const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);
      return await db
        .select()
        .from(reminders)
        .where(and(
          eq(reminders.triggerType, 'time'),
          eq(reminders.status, 'pending'),
          gte(reminders.triggerTime, now),
          lte(reminders.triggerTime, windowEnd),
          isNull(reminders.advanceNotifiedAt)
        ))
        .orderBy(reminders.triggerTime);
    } catch (error) {
      console.error('Failed to get advance warning reminders:', error);
      return [];
    }
  }

  async markAdvanceNotified(id: string): Promise<void> {
    try {
      await db
        .update(reminders)
        .set({ advanceNotifiedAt: new Date() })
        .where(eq(reminders.id, id));
    } catch (error) {
      console.error('Failed to mark advance notified:', error);
    }
  }

  async getMessageConversations(userId: string, limit = 50, offset = 0): Promise<MessageConversation[]> {
    return db.select().from(messageConversations)
      .where(eq(messageConversations.userId, userId))
      .orderBy(desc(messageConversations.lastMessageAt))
      .limit(limit).offset(offset);
  }

  async getMessageConversation(id: string, userId: string): Promise<MessageConversation | undefined> {
    const [conv] = await db.select().from(messageConversations)
      .where(and(eq(messageConversations.id, id), eq(messageConversations.userId, userId)));
    return conv;
  }

  async getMessageConversationByContact(userId: string, contactAddress: string, platform: string): Promise<MessageConversation | undefined> {
    const [conv] = await db.select().from(messageConversations)
      .where(and(
        eq(messageConversations.userId, userId),
        eq(messageConversations.contactAddress, contactAddress),
        eq(messageConversations.platform, platform)
      ));
    return conv;
  }

  async upsertMessageConversation(conversation: InsertMessageConversation): Promise<MessageConversation> {
    const [result] = await db.insert(messageConversations)
      .values(conversation)
      .onConflictDoUpdate({
        target: [messageConversations.userId, messageConversations.contactAddress, messageConversations.platform],
        set: {
          contactName: conversation.contactName || sql`${messageConversations.contactName}`,
          lastMessageAt: conversation.lastMessageAt || sql`${messageConversations.lastMessageAt}`,
          messageCount: sql`COALESCE(${messageConversations.messageCount}, 0) + COALESCE(${conversation.messageCount || 0}, 0)`,
          unprocessedCount: sql`COALESCE(${messageConversations.unprocessedCount}, 0) + COALESCE(${conversation.unprocessedCount || 0}, 0)`,
        },
      })
      .returning();
    return result;
  }

  async updateConversationContactName(id: string, userId: string, contactName: string): Promise<MessageConversation | undefined> {
    const [result] = await db.update(messageConversations)
      .set({ contactName })
      .where(and(eq(messageConversations.id, id), eq(messageConversations.userId, userId)))
      .returning();
    return result;
  }

  async getMessageConversationsCount(userId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(messageConversations)
      .where(eq(messageConversations.userId, userId));
    return result?.count || 0;
  }

  async getMessages(userId: string, conversationId: string, limit = 100, offset = 0): Promise<Message[]> {
    return db.select().from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.conversationId, conversationId)))
      .orderBy(desc(messages.timestamp))
      .limit(limit).offset(offset);
  }

  async getMessagesCount(userId: string, conversationId?: string): Promise<number> {
    const conditions = [eq(messages.userId, userId)];
    if (conversationId) conditions.push(eq(messages.conversationId, conversationId));
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(...conditions));
    return result?.count || 0;
  }

  async getRecentMessages(userId: string, daysBack: number, limit = 200): Promise<Message[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    return db.select().from(messages)
      .where(and(eq(messages.userId, userId), gte(messages.timestamp, cutoff)))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }

  async getMessagesByDateRange(userId: string, startDate: Date, endDate: Date, limit = 50): Promise<Message[]> {
    return db.select().from(messages)
      .where(and(
        eq(messages.userId, userId),
        gte(messages.timestamp, startDate),
        lte(messages.timestamp, endDate)
      ))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [result] = await db.insert(messages).values(message).returning();
    return result;
  }

  async createMessagesBatch(messageBatch: InsertMessage[]): Promise<number> {
    if (messageBatch.length === 0) return 0;
    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < messageBatch.length; i += batchSize) {
      const chunk = messageBatch.slice(i, i + batchSize);
      const result = await db.insert(messages).values(chunk).onConflictDoNothing().returning();
      inserted += result.length;
    }
    return inserted;
  }

  async getUnprocessedMessages(userId: string, limit = 50): Promise<Message[]> {
    return db.select().from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.aiProcessed, false)))
      .orderBy(messages.timestamp)
      .limit(limit);
  }

  async getMessageProcessingStatus(userId: string): Promise<{ total: number; processed: number; unprocessed: number }> {
    const [result] = await db.select({
      total: sql<number>`count(*)::int`,
      processed: sql<number>`count(*) filter (where ${messages.aiProcessed} = true)::int`,
      unprocessed: sql<number>`count(*) filter (where ${messages.aiProcessed} = false)::int`,
    }).from(messages).where(eq(messages.userId, userId));
    return result || { total: 0, processed: 0, unprocessed: 0 };
  }

  async markMessagesProcessed(messageIds: string[], updates: Partial<InsertMessage>[]): Promise<void> {
    for (let i = 0; i < messageIds.length; i++) {
      await db.update(messages)
        .set({ ...updates[i], aiProcessed: true })
        .where(eq(messages.id, messageIds[i]));
    }
  }

  async messageExistsByExternalId(userId: string, externalId: string, source: string): Promise<boolean> {
    const [result] = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.externalId, externalId), eq(messages.source, source)))
      .limit(1);
    return !!result;
  }

  async searchMessages(userId: string, queryVector: number[], limit = 20): Promise<Array<Message & { similarity: number }>> {
    const vectorStr = `[${queryVector.join(',')}]`;
    const results = await db.execute(sql`
      SELECT *, 1 - (embedding_vector <=> ${vectorStr}::vector) as similarity
      FROM messages
      WHERE user_id = ${userId} AND embedding_vector IS NOT NULL
      ORDER BY embedding_vector <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);
    return results.rows as any;
  }

  async getMessageImports(userId: string): Promise<MessageImport[]> {
    return db.select().from(messageImports)
      .where(eq(messageImports.userId, userId))
      .orderBy(desc(messageImports.importedAt));
  }

  async createMessageImport(importRecord: InsertMessageImport): Promise<MessageImport> {
    const [result] = await db.insert(messageImports).values(importRecord).returning();
    return result;
  }

  async updateMessageImport(id: string, userId: string, updates: Partial<MessageImport>): Promise<MessageImport | undefined> {
    const [result] = await db.update(messageImports)
      .set(updates)
      .where(and(eq(messageImports.id, id), eq(messageImports.userId, userId)))
      .returning();
    return result;
  }

  // ── Message cleanup ──────────────────────────────────────────────────────────

  async deleteConversationRelayMessages(userId: string, conversationId: string): Promise<number> {
    const result = await db.delete(messages)
      .where(and(
        eq(messages.userId, userId),
        eq(messages.conversationId, conversationId),
        eq(messages.source, 'live_relay')
      ));
    const deleted = result.rowCount ?? 0;

    // Recompute conversation aggregates so messageCount / lastMessageAt stay accurate
    const [stats] = await db.select({
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date | null>`max(${messages.timestamp})`,
    })
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.conversationId, conversationId)));

    await db.update(messageConversations)
      .set({
        messageCount: stats?.count ?? 0,
        lastMessageAt: stats?.lastAt ?? null,
      })
      .where(and(eq(messageConversations.id, conversationId), eq(messageConversations.userId, userId)));

    return deleted;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const result = await db.delete(messageConversations)
      .where(and(
        eq(messageConversations.id, conversationId),
        eq(messageConversations.userId, userId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async mergeConversations(userId: string, targetId: string, sourceIds: string[]): Promise<{ merged: number; movedMessages: number }> {
    if (sourceIds.length === 0) throw new Error('No source conversations provided');

    // Verify all IDs belong to this user before touching anything
    const allIds = [targetId, ...sourceIds];
    const owned = await db.select({ id: messageConversations.id })
      .from(messageConversations)
      .where(and(
        eq(messageConversations.userId, userId),
        inArray(messageConversations.id, allIds)
      ));
    if (owned.length !== allIds.length) {
      throw new Error('One or more conversations not found or not owned by user');
    }

    // Move all messages from source conversations into the target.
    // Do this BEFORE deleting source rows so the FK cascade doesn't drop them.
    let movedMessages = 0;
    for (const sourceId of sourceIds) {
      const moved = await db.update(messages)
        .set({ conversationId: targetId })
        .where(and(
          eq(messages.userId, userId),
          eq(messages.conversationId, sourceId)
        ))
        .returning({ id: messages.id });
      movedMessages += moved.length;
    }

    // Recalculate target conversation aggregates from the (now-merged) messages
    const [stats] = await db.select({
      count: sql<number>`count(*)::int`,
      latest: sql<Date | null>`max(${messages.timestamp})`,
    })
      .from(messages)
      .where(and(
        eq(messages.userId, userId),
        eq(messages.conversationId, targetId)
      ));

    await db.update(messageConversations)
      .set({
        messageCount: stats?.count ?? 0,
        unprocessedCount: sql`(
          SELECT count(*)::int FROM ${messages}
          WHERE ${messages.conversationId} = ${targetId}
            AND ${messages.userId} = ${userId}
            AND ${messages.topicTag} IS NULL
        )`,
        // Use null when no messages remain, not now() — keeps true aggregate semantics
        // and avoids artificially inflating the lastMessageAt timestamp.
        // MAX() returns a string from postgres; wrap in new Date() so Drizzle's
        // PgTimestamp.mapToDriverValue can call .toISOString() on it.
        lastMessageAt: stats?.latest ? new Date(stats.latest as any) : null,
      })
      .where(and(
        eq(messageConversations.id, targetId),
        eq(messageConversations.userId, userId)
      ));

    // Delete source conversation rows. Any messages still pointing to them
    // (none, since we moved them all) would cascade-delete; that is intentional.
    await db.delete(messageConversations)
      .where(and(
        eq(messageConversations.userId, userId),
        inArray(messageConversations.id, sourceIds)
      ));

    return { merged: sourceIds.length, movedMessages };
  }

  // ── Relay API ────────────────────────────────────────────────────────────────

  async getUserByRelayApiKey(apiKey: string): Promise<User | undefined> {
    const [row] = await db
      .select({ user: users })
      .from(settings)
      .innerJoin(users, eq(settings.userId, users.id))
      .where(eq(settings.relayApiKey, apiKey))
      .limit(1);
    return row?.user;
  }

  async getRelayDestinations(userId: string): Promise<RelayDestination[]> {
    return db.select().from(relayDestinations)
      .where(eq(relayDestinations.userId, userId))
      .orderBy(relayDestinations.createdAt);
  }

  async createRelayDestination(data: InsertRelayDestination): Promise<RelayDestination> {
    const [result] = await db.insert(relayDestinations).values(data).returning();
    return result;
  }

  async updateRelayDestination(id: string, userId: string, updates: Partial<InsertRelayDestination>): Promise<RelayDestination | undefined> {
    const [result] = await db.update(relayDestinations)
      .set(updates)
      .where(and(eq(relayDestinations.id, id), eq(relayDestinations.userId, userId)))
      .returning();
    return result;
  }

  async deleteRelayDestination(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(relayDestinations)
      .where(and(eq(relayDestinations.id, id), eq(relayDestinations.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async createRelayEvent(data: InsertRelayEvent): Promise<RelayEvent> {
    const [result] = await db.insert(relayEvents).values(data).returning();
    return result;
  }

  async getRelayEvents(userId: string, limit = 50): Promise<RelayEvent[]> {
    return db.select().from(relayEvents)
      .where(eq(relayEvents.userId, userId))
      .orderBy(desc(relayEvents.createdAt))
      .limit(limit);
  }

  // ─── Automation Rules ──────────────────────────────────────────────────────

  async getAutomationRules(userId: string): Promise<AutomationRule[]> {
    return db.select().from(automationRules)
      .where(eq(automationRules.userId, userId))
      .orderBy(desc(automationRules.createdAt));
  }

  async getAutomationRule(id: string, userId: string): Promise<AutomationRule | undefined> {
    const [rule] = await db.select().from(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)));
    return rule;
  }

  async getEnabledRulesByTrigger(userId: string, triggerType: string): Promise<AutomationRule[]> {
    return db.select().from(automationRules)
      .where(and(
        eq(automationRules.userId, userId),
        eq(automationRules.triggerType, triggerType),
        eq(automationRules.enabled, true)
      ));
  }

  async createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule> {
    const [rule] = await db.insert(automationRules).values(data).returning();
    return rule;
  }

  async updateAutomationRule(id: string, userId: string, data: Partial<InsertAutomationRule>): Promise<AutomationRule> {
    const [rule] = await db.update(automationRules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)))
      .returning();
    return rule;
  }

  async deleteAutomationRule(id: string, userId: string): Promise<void> {
    await db.delete(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)));
  }

  async recordRuleExecution(id: string, userId: string, success: boolean, error?: string, chainDepth?: number): Promise<void> {
    const nowUtc = new Date();
    const todayUtc = nowUtc.toISOString().slice(0, 10); // YYYY-MM-DD UTC

    // Read current todayRunDate to decide whether to reset or increment the counter
    const [current] = await db
      .select({ todayRunDate: automationRules.todayRunDate, todayRunCount: automationRules.todayRunCount })
      .from(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)));

    const newTodayCount =
      current?.todayRunDate === todayUtc
        ? (current.todayRunCount ?? 0) + 1
        : 1; // new day — reset to 1

    await db.update(automationRules)
      .set({
        lastRunAt: nowUtc,
        lastRunResult: success ? 'success' : 'error',
        lastRunError: error ?? null,
        lastChainDepth: chainDepth ?? 0,
        runCount: sql`${automationRules.runCount} + 1`,
        todayRunDate: todayUtc,
        todayRunCount: newTodayCount,
        updatedAt: nowUtc,
      })
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)));
  }

  async countRuleRunsToday(id: string, userId: string): Promise<number> {
    const todayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const [row] = await db
      .select({ todayRunDate: automationRules.todayRunDate, todayRunCount: automationRules.todayRunCount })
      .from(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.userId, userId)));
    if (!row || row.todayRunDate !== todayUtc) return 0;
    return row.todayRunCount ?? 0;
  }

  // ─── Profile Observations ──────────────────────────────────────────────────

  async getProfileObservations(userId: string, status?: string): Promise<ProfileObservation[]> {
    const conditions = [eq(profileObservations.userId, userId)];
    if (status) conditions.push(eq(profileObservations.status, status));
    return db.select().from(profileObservations)
      .where(and(...conditions))
      .orderBy(desc(profileObservations.createdAt));
  }

  async createProfileObservation(data: InsertProfileObservation): Promise<ProfileObservation> {
    const [obs] = await db.insert(profileObservations).values(data).returning();
    return obs;
  }

  async updateProfileObservationStatus(id: string, userId: string, status: string): Promise<ProfileObservation | undefined> {
    const [updated] = await db.update(profileObservations)
      .set({ status, reviewedAt: new Date() })
      .where(and(eq(profileObservations.id, id), eq(profileObservations.userId, userId)))
      .returning();
    return updated;
  }

  async getConfirmedObservationsText(userId: string, limit = 20): Promise<string> {
    // Cap at `limit` (default 20) — ordered by highest confidence first, then most recent.
    // Beyond ~20 confirmed facts the signal-to-noise ratio degrades and context bloat hurts quality.
    const confirmed = await db.select({ observation: profileObservations.observation, confidence: profileObservations.confidence })
      .from(profileObservations)
      .where(and(eq(profileObservations.userId, userId), eq(profileObservations.status, 'confirmed')))
      .orderBy(desc(profileObservations.confidence), desc(profileObservations.createdAt))
      .limit(limit);
    if (confirmed.length === 0) return '';
    return confirmed.map(r => `• ${r.observation}`).join('\n');
  }

  async getConfirmedObservationsCount(userId: string): Promise<number> {
    const rows = await db.select({ id: profileObservations.id })
      .from(profileObservations)
      .where(and(eq(profileObservations.userId, userId), eq(profileObservations.status, 'confirmed')));
    return rows.length;
  }

  async archiveOldestConfirmedObservation(userId: string): Promise<string | null> {
    // Find the lowest-confidence + oldest confirmed observation and archive it.
    const candidate = await db.select({ id: profileObservations.id })
      .from(profileObservations)
      .where(and(eq(profileObservations.userId, userId), eq(profileObservations.status, 'confirmed')))
      .orderBy(asc(profileObservations.confidence), asc(profileObservations.createdAt))
      .limit(1);
    if (candidate.length === 0) return null;
    const id = candidate[0].id;
    await db.update(profileObservations)
      .set({ status: 'archived', reviewedAt: new Date() })
      .where(and(eq(profileObservations.id, id), eq(profileObservations.userId, userId)));
    return id;
  }

  async expireOldPendingObservations(userId: string): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    await db.update(profileObservations)
      .set({ status: 'denied', reviewedAt: new Date() })
      .where(and(
        eq(profileObservations.userId, userId),
        eq(profileObservations.status, 'pending'),
        lte(profileObservations.createdAt, cutoff)
      ));
  }

  // ─── AI Chat Sessions & Messages ──────────────────────────────────────────

  async getAiChatSessions(userId: string): Promise<AiChatSession[]> {
    return db.select().from(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId))
      .orderBy(desc(aiChatSessions.lastMessageAt));
  }

  async getAiChatSession(id: string, userId: string): Promise<AiChatSession | undefined> {
    const [session] = await db.select().from(aiChatSessions)
      .where(and(eq(aiChatSessions.id, id), eq(aiChatSessions.userId, userId)));
    return session;
  }

  async createAiChatSession(userId: string, title = 'New Chat'): Promise<AiChatSession> {
    const [session] = await db.insert(aiChatSessions)
      .values({ userId, title })
      .returning();
    return session;
  }

  async updateAiChatSession(id: string, userId: string, updates: { title?: string; lastMessageAt?: Date; messageCount?: number }): Promise<AiChatSession | undefined> {
    const [updated] = await db.update(aiChatSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(aiChatSessions.id, id), eq(aiChatSessions.userId, userId)))
      .returning();
    return updated;
  }

  async deleteAiChatSession(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(aiChatSessions)
      .where(and(eq(aiChatSessions.id, id), eq(aiChatSessions.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getAiChatMessages(sessionId: string, userId: string): Promise<AiChatMessage[]> {
    return db.select().from(aiChatMessages)
      .where(and(eq(aiChatMessages.sessionId, sessionId), eq(aiChatMessages.userId, userId)))
      .orderBy(aiChatMessages.timestamp);
  }

  async getAiChatMessage(id: string, userId: string): Promise<AiChatMessage | undefined> {
    const [msg] = await db.select().from(aiChatMessages)
      .where(and(eq(aiChatMessages.id, id), eq(aiChatMessages.userId, userId)));
    return msg;
  }

  async createAiChatMessage(data: { sessionId: string; userId: string; role: string; content: string }): Promise<AiChatMessage> {
    const [msg] = await db.insert(aiChatMessages).values(data).returning();
    return msg;
  }

  async markAiChatMessageSaved(id: string, userId: string, savedAs: 'ecosystem' | 'memory'): Promise<AiChatMessage | undefined> {
    const [updated] = await db.update(aiChatMessages)
      .set({ savedAs, savedAt: new Date() })
      .where(and(eq(aiChatMessages.id, id), eq(aiChatMessages.userId, userId)))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
