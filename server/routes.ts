import express, { type Express, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSettingsSchema, insertUserSchema, insertCategorySchema, insertPersonSchema, mcpPayloadSchema, insertIdeaSchema, insertIdeaTaskSchema, insertGoalSchema, goalMilestoneSchema, insertReminderSchema, IDEA_STAGES, type User, type IdeaChatMessage, type InsertLogEntry, type InsertReminder, type Reminder } from "@shared/schema";
import { z } from "zod";
import { openai, extractMetadata, generateEmbedding, decomposeQuery, synthesizeSearchAnswer, generateThematicInsights, generateMorningBriefing, detectPatternAlerts, answerFinancialQuery, generatePersonalNewsFeed, PersonalNewsFeed, detectIntent, analyzeGoalProgress, suggestGoalMilestones, GoalContext, detectGoalPatternAlerts, detectCalendarEvent, formatDateForTimezone, formatDateTimeForTimezone } from "./ai-service";
import bcrypt from "bcrypt";
import passport from "./auth";
import { requireAuth } from "./auth";
import rateLimit from "express-rate-limit";
import { isCalendarConnected, isGoogleCalendarConnected, getTodaysEvents, getUpcomingEvents, findRelevantEvent, createCalendarEvent, findDuplicateEvent } from "./calendar-service";
import { isOutlookConnected } from "./outlook-calendar-service";
import { isGmailConnected, getGmailCapabilities, getRecentEmails } from "./gmail-service";
import { isOutlookMailConnected, getOutlookRecentEmails } from "./outlook-mail-service";
import { isTelegramConfigured, handleTelegramWebhook, generateVerificationCode, sendTelegramMessage, setWebhook, sendBriefingToTelegram, sendAlertToTelegram, type TelegramUpdate } from "./telegram-service";
import { buildLocationContext, formatLocationContextForAI, parseGoogleTakeoutFile, convertToInsertLocation, clusterLocations, detectFrequentPlaces, reverseGeocode } from "./location-service";
import { getAvailableActionTypes, approveAction, rejectAction, processUserInputForActions } from "./ai-actions-service";
import * as plaidService from "./plaid-service";
import { getContextualDiscoveries } from "./contextual-discoveries-service";
import { detectHighSignalMentions, shouldTriggerAlert, formatHighSignalAlert, type HighSignalMatch } from "./high-signal-service";
import { isPushConfigured, getVapidPublicKey, sendPushNotification, sendPushToAllUserDevices } from "./push-service";
import { parseAndImportNDJSON } from "./sms-import-service";
import { processMessageBatch } from "./message-ai-service";
import { requireTier, requireMemoryQuota } from "./tier-middleware";
import { isStripeConfigured, createCheckoutSession, createPortalSession } from "./stripe-service";

// Feature flags - Plaid integration controlled by environment
// Dynamic check to handle runtime config changes
function isPlaidFeatureEnabled(): boolean {
  return process.env.PLAID_FEATURE_ENABLED !== 'false' && plaidService.isPlaidConfigured();
}

// Background job tracking for re-analysis
interface BackfillJob {
  status: 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  processed: number;
  calendarLinked: number;
  embeddingsGenerated: number;
  errors: number;
  startedAt: Date;
  completedAt?: Date;
  message?: string;
}
const backfillJobs = new Map<string, BackfillJob>();

// Type for JSONB milestone data stored in goals table
interface MilestoneJSON {
  id?: string;
  title?: string;
  isCompleted?: boolean;
  completedAt?: string;
  order?: number;
}

// Type for AI duplicate detection response
interface DuplicateGroupJSON {
  ids?: string[];
  reason?: string;
  suggestedTargetId?: string;
  confidence?: string;
}

// Type for AI sort field response
interface AISortFieldJSON {
  field?: string;
  direction?: string;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts, please try again later', status: 'error' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many signup attempts, please try again later', status: 'error' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for AI-heavy routes to prevent OpenAI quota issues
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per user
  message: { message: 'Too many AI requests, please slow down', status: 'error' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = req.user as User | undefined;
    // User ID is the primary key for rate limiting (most reliable)
    return user?.id?.toString() || 'unauthenticated';
  },
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

// Stricter rate limiter for expensive operations like backfill
const backfillLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 backfill requests per hour per user
  message: { message: 'Too many re-analysis requests. Please wait before trying again.', status: 'error' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = req.user as User | undefined;
    // Backfill only works for authenticated users, so user ID is always available
    return user?.id?.toString() || 'unauthenticated';
  },
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

// Validation schemas for API endpoints
const calendarEventDetectSchema = z.object({
  memoryText: z.string().min(1, "Memory text is required").max(5000, "Memory text too long"),
  timezone: z.string().optional(),
});

const calendarEventCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  startDateTime: z.string().min(1, "Start time is required"),
  endDateTime: z.string().min(1, "End time is required"),
  attendees: z.array(z.string()).optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  memoryId: z.string().uuid().optional(),
  timezone: z.string().optional(),
});

const calendarDuplicateCheckSchema = z.object({
  title: z.string().min(1, "Title is required"),
  startDateTime: z.string().min(1, "Start time is required"),
});

const insightsQuerySchema = z.object({
  question: z.string().max(1000).optional(),
  days: z.number().int().min(1).max(365).optional().default(30),
});

const backfillSchema = z.object({
  force: z.boolean().optional().default(false),
  includeCalendar: z.boolean().optional().default(true),
  includeEmbeddings: z.boolean().optional().default(false),
});

/**
 * API Routes Registration with Comprehensive Error Handling
 * 
 * This module registers all REST API endpoints with:
 * - Input validation using Zod schemas
 * - Proper error handling and logging
 * - Consistent response formatting
 * - Database transaction management
 * 
 * All routes follow RESTful conventions and include proper status codes
 */

/**
 * Utility function for consistent error response formatting
 * @param res - Express response object
 * @param statusCode - HTTP status code
 * @param message - Error message for client
 * @param error - Optional detailed error for logging
 */
function sendErrorResponse(res: Response, statusCode: number, message: string, error?: unknown) {
  if (error) {
    console.error(`API Error (${statusCode}):`, error);
  }
  res.status(statusCode).json({ 
    message, 
    timestamp: new Date().toISOString(),
    status: 'error'
  });
}

/**
 * Format briefing data for Telegram HTML message
 */
function formatBriefingForTelegram(briefing: {
  greeting?: string;
  focusAreas?: string[];
  reminders?: string[];
  moodTrend?: string;
  emailHighlights?: string[];
  affirmation?: string;
}): string {
  let message = briefing.greeting ? `${briefing.greeting}\n\n` : '';
  
  const focusAreas = briefing.focusAreas || [];
  if (focusAreas.length > 0) {
    message += `<b>📌 Focus Areas</b>\n`;
    focusAreas.forEach(area => {
      message += `• ${area}\n`;
    });
    message += '\n';
  }
  
  const reminders = briefing.reminders || [];
  if (reminders.length > 0) {
    message += `<b>⏰ Reminders</b>\n`;
    reminders.forEach(reminder => {
      message += `• ${reminder}\n`;
    });
    message += '\n';
  }
  
  if (briefing.moodTrend) {
    message += `<b>📊 Mood Trend</b>\n${briefing.moodTrend}\n\n`;
  }
  
  const emailHighlights = briefing.emailHighlights || [];
  if (emailHighlights.length > 0) {
    message += `<b>📧 Email Highlights</b>\n`;
    emailHighlights.forEach(highlight => {
      message += `• ${highlight}\n`;
    });
    message += '\n';
  }
  
  if (briefing.affirmation) {
    message += `✨ ${briefing.affirmation}`;
  }
  
  return message || 'Your daily briefing is ready!';
}

/**
 * Format alerts for Telegram HTML message
 */
function formatAlertsForTelegram(alerts: Array<{
  type: 'positive' | 'negative' | 'neutral' | 'insight';
  title: string;
  description: string;
  actionSuggestion?: string;
}>): string {
  if (alerts.length === 0) return '';
  
  let message = '';
  alerts.forEach(alert => {
    const icon = alert.type === 'positive' ? '🟢' : alert.type === 'negative' ? '🔴' : alert.type === 'insight' ? '💡' : '⚪';
    message += `${icon} <b>${alert.title}</b>\n`;
    message += `${alert.description}\n`;
    if (alert.actionSuggestion) {
      message += `💭 ${alert.actionSuggestion}\n`;
    }
    message += '\n';
  });
  
  return message;
}

/**
 * Register all API routes with error handling and validation
 * @param app - Express application instance
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express): Promise<Server> {
  
  /**
   * AUTHENTICATION ROUTES
   * Handle user registration, login, and session management
   */
  
  /**
   * POST /api/auth/signup - Register a new user
   */
  app.post("/api/auth/signup", signupLimiter, async (req, res) => {
    try {
      const { username, password } = insertUserSchema.parse(req.body);
      
      // Check if username already exists
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return sendErrorResponse(res, 400, "Username already exists");
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await storage.createUser({
        username,
        password: hashedPassword,
      });
      
      // Log the user in
      req.login(user, (err) => {
        if (err) {
          return sendErrorResponse(res, 500, "Failed to log in after signup", err);
        }
        res.json({
          status: 'success',
          data: { id: user.id, username: user.username },
          timestamp: new Date().toISOString()
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid signup data", 
          errors: error.errors,
          timestamp: new Date().toISOString()
        });
      }
      sendErrorResponse(res, 500, "Failed to create account", error);
    }
  });
  
  /**
   * POST /api/auth/login - Log in an existing user
   */
  app.post("/api/auth/login", authLimiter, (req, res, next) => {
    passport.authenticate('local', (err: Error | null, user: User | false, info: { message: string } | undefined) => {
      if (err) {
        return sendErrorResponse(res, 500, "Login error", err);
      }
      if (!user) {
        return sendErrorResponse(res, 401, info?.message || "Invalid credentials");
      }
      req.login(user, (err) => {
        if (err) {
          return sendErrorResponse(res, 500, "Failed to establish session", err);
        }
        res.json({
          status: 'success',
          data: { id: user.id, username: user.username },
          timestamp: new Date().toISOString()
        });
      });
    })(req, res, next);
  });
  
  /**
   * POST /api/auth/logout - Log out current user
   */
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return sendErrorResponse(res, 500, "Logout failed", err);
      }
      res.json({
        status: 'success',
        message: 'Logged out successfully',
        timestamp: new Date().toISOString()
      });
    });
  });
  
  /**
   * GET /api/auth/user - Get current authenticated user
   */
  app.get("/api/auth/user", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const user = req.user as User;
      res.json({
        status: 'success',
        data: { id: user.id, username: user.username },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  /**
   * DASHBOARD STATS ENDPOINT
   * Lightweight consolidated statistics endpoint for dashboard efficiency
   */

  /**
   * GET /api/dashboard/stats - Get consolidated dashboard statistics
   * Returns counts, recent activity summary, and key metrics in one request
   * Requires authentication
   */
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      // Fetch all stats in parallel with efficient COUNT queries
      const [
        totalCount,
        moodStats,
        topicFrequency,
        activePeopleCount,
      ] = await Promise.all([
        storage.getLogEntriesCount(user.id),
        storage.getMoodStats(user.id, 7), // Last 7 days with date-filtered GROUP BY
        storage.getTopicFrequency(user.id, 7), // Last 7 days with date-filtered GROUP BY
        storage.getActivePeopleCount(user.id), // Efficient COUNT query
      ]);
      
      // Calculate summary metrics from already-aggregated data
      const topMood = moodStats.length > 0 
        ? moodStats.reduce((a, b) => a.count > b.count ? a : b).mood 
        : 'neutral';
      const topTopic = topicFrequency.length > 0 
        ? topicFrequency[0].topic 
        : 'General';
      
      res.json({
        status: 'success',
        data: {
          totalMemories: totalCount,
          memoriesThisWeek: moodStats.reduce((sum, m) => sum + m.count, 0),
          topMood,
          topTopic,
          activePeople: activePeopleCount,
          moodDistribution: moodStats.slice(0, 5),
          topTopics: topicFrequency.slice(0, 5),
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch dashboard stats", error);
    }
  });

  /**
   * MEMORY/LOG ENTRY ROUTES
   * Handle memory storage with AI-powered metadata extraction
   * All routes require authentication
   */

  /**
   * POST /api/intent - Detect whether input is a log or query
   * Uses AI to classify user input for unified input flow
   * Requires authentication
   */
  app.post("/api/intent", requireAuth, aiLimiter, async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return sendErrorResponse(res, 400, "text is required");
      }

      const result = await detectIntent(text.trim());
      
      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to detect intent", error);
    }
  });
  
  /**
   * POST /api/memories - Save a new memory with optional manual category
   * Accepts raw voice text and optional topicTag
   * If topicTag provided, uses it; otherwise extracts metadata with AI
   * Now includes mood detection and people tracking
   * Requires authentication
   */
  app.post("/api/memories", requireAuth, requireMemoryQuota(), aiLimiter, async (req, res) => {
    try {
      const { 
        memoryText, 
        topicTag: userProvidedTag,
        geoLat,
        geoLng,
        geoAccuracyMeters,
        geoPlaceName,
        timezone,
      } = req.body;
      const user = req.user as User;
      
      if (!memoryText || typeof memoryText !== 'string') {
        return sendErrorResponse(res, 400, "memoryText is required");
      }

      // Validate category if provided (just ensure it's a non-empty string)
      if (userProvidedTag && (typeof userProvidedTag !== 'string' || userProvidedTag.trim() === '')) {
        return sendErrorResponse(res, 400, "Invalid category. Must be a non-empty string");
      }

      // Auto-create category if user provided one and it doesn't exist
      if (userProvidedTag) {
        await storage.createCategoryIfNotExists(user.id, userProvidedTag);
      }

      // Run AI metadata extraction, embedding generation, and settings fetch in parallel
      // None of these depend on each other, so parallelizing saves 0.5-1.5 seconds
      const [extracted, embeddingVector, settingsForCalendar] = await Promise.all([
        extractMetadata(memoryText, timezone),
        generateEmbedding(memoryText),
        storage.getSettings(user.id),
      ]);

      // Use user-provided category or AI extraction
      const topicTag = userProvidedTag || extracted.topicTag;
      const metadataJson = userProvidedTag ? {} : extracted.metadataJson;

      const isZeroVector = embeddingVector.every(v => v === 0);
      if (isZeroVector) {
        console.warn("Zero embedding vector - OpenAI may have failed");
      }

      // Try to link to a calendar event if available (settings already fetched above)
      let calendarEventId: string | undefined;
      let calendarEventTitle: string | undefined;
      let calendarEventAttendees: string[] | undefined;
      let calendarReasoning: string | undefined;
      
      try {
        if (settingsForCalendar?.calendarAutoLink !== false) {
          const relevantEvent = await findRelevantEvent(new Date());
          if (relevantEvent) {
            calendarEventId = relevantEvent.id;
            calendarEventTitle = relevantEvent.title;
            calendarEventAttendees = relevantEvent.attendees;
            calendarReasoning = `Memory recorded during "${relevantEvent.title}" event (within event timeframe)`;
          }
        }
      } catch (calendarError) {
        // Calendar not connected or error - continue without it
      }

      // Combine AI reasoning with calendar reasoning
      const aiReasoning = extracted.aiReasoning ? {
        ...extracted.aiReasoning,
        ...(calendarReasoning ? { calendar: calendarReasoning } : {})
      } : calendarReasoning ? { calendar: calendarReasoning } : undefined;

      // Save to database with user ID, mood, detected people, geolocation, calendar, and importance
      const logEntry = await storage.createLogEntry({
        userId: user.id,
        memoryText,
        topicTag,
        metadataJson,
        embeddingVector,
        mood: extracted.mood,
        moodScore: extracted.moodScore,
        detectedPeople: extracted.detectedPeople,
        // Geolocation context (optional)
        geoLat: geoLat !== undefined ? parseFloat(geoLat) : undefined,
        geoLng: geoLng !== undefined ? parseFloat(geoLng) : undefined,
        geoAccuracyMeters: geoAccuracyMeters !== undefined ? parseFloat(geoAccuracyMeters) : undefined,
        geoPlaceName: geoPlaceName || undefined,
        // Calendar context (optional)
        calendarEventId,
        calendarEventTitle,
        calendarEventAttendees,
        // AI decision log for transparency
        aiReasoning,
        // AI-assigned importance level (1-10)
        importance: extracted.importance,
      });

      // CRITICAL: Send response IMMEDIATELY after DB save - nothing else can fail the response
      // Use only primitive values to avoid any serialization issues
      const responsePayload = {
        status: 'success',
        data: {
          id: logEntry.id + '',
          topicTag: topicTag + '',
          memoryText: memoryText.substring(0, 100) + (memoryText.length > 100 ? '...' : ''),
          mood: extracted.mood || null,
          moodScore: extracted.moodScore || null,
          lifePurposeTheme: extracted.lifePurposeTheme || false,
        },
        message: 'Memory saved successfully',
        timestamp: new Date().toISOString(),
      };
      
      res.status(201).json(responsePayload);
      
      // ALL background processing happens AFTER response is sent
      // These are completely decoupled from the response
      setImmediate(() => {
        try {
          // Increment monthly memory count for free-tier users
          if (user.subscriptionTier === 'free') {
            const currentCount = user.memoriesThisMonth || 0;
            storage.updateUser(user.id, { memoriesThisMonth: currentCount + 1 }).catch(err =>
              console.error("Failed to increment memory count:", err)
            );
          }

          // Track people mentions in the people table
          if (extracted.detectedPeople && extracted.detectedPeople.length > 0) {
            Promise.all(
              extracted.detectedPeople.map(name => storage.upsertPerson(user.id, name))
            ).catch(err => console.error("Failed to track people:", err));
          }
          
          // Store location in location_history table
          if (geoLat !== undefined && geoLng !== undefined) {
            const lat = parseFloat(geoLat);
            const lng = parseFloat(geoLng);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              storage.createLocationHistory({
                userId: user.id,
                latitude: lat,
                longitude: lng,
                timestamp: new Date(),
                placeName: geoPlaceName || undefined,
                source: 'memory',
                accuracyMeters: geoAccuracyMeters !== undefined ? parseFloat(geoAccuracyMeters) : undefined,
              }).catch(err => console.error("Failed to save location history:", err));
            }
          }

          // AI Action Detection
          import('./ai-actions-service').then(({ processUserInputForActions }) => {
            processUserInputForActions(user.id, memoryText, 'memory', logEntry.id, { timezone })
              .catch(err => console.warn('AI action detection failed:', err));
          }).catch(err => console.warn('Failed to load ai-actions-service:', err));
          
          // Auto-create reminder if detected in memory
          if (extracted.reminderIntent?.detected && extracted.reminderIntent.content) {
            const reminderData: InsertReminder = {
              content: extracted.reminderIntent.content!,
              triggerType: extracted.reminderIntent.triggerType || 'time',
              sourceMemoryId: logEntry.id,
            };
            
            if (extracted.reminderIntent.triggerType === 'time' && extracted.reminderIntent.triggerTime) {
              let triggerTimeStr = extracted.reminderIntent.triggerTime;
              if (!triggerTimeStr.endsWith('Z') && !triggerTimeStr.match(/[+-]\d{2}:\d{2}$/)) {
                triggerTimeStr += 'Z';
              }
              const parsedTime = new Date(triggerTimeStr);
              
              if (!isNaN(parsedTime.getTime()) && parsedTime > new Date()) {
                reminderData.triggerTime = parsedTime;
              } else {
                const fallback = new Date();
                fallback.setMinutes(fallback.getMinutes() + 30);
                reminderData.triggerTime = fallback;
                console.warn(`AI returned invalid/past reminder time "${extracted.reminderIntent.triggerTime}" (tz: ${timezone}), defaulting to 30min from now`);
              }
            }
            if (extracted.reminderIntent.triggerType === 'location' && extracted.reminderIntent.triggerLocationName) {
              reminderData.triggerLocationName = extracted.reminderIntent.triggerLocationName;
            }
            
            storage.createReminder(user.id, reminderData)
              .catch(err => console.error('Failed to auto-create reminder:', err));
          }
          
          // Check location-based reminders if this memory has location
          if (geoPlaceName) {
            storage.getPendingLocationReminders(user.id)
              .then(async locationReminders => {
                for (const reminder of locationReminders) {
                  if (reminder.triggerLocationName && 
                      geoPlaceName.toLowerCase().includes(reminder.triggerLocationName.toLowerCase())) {
                    await storage.triggerReminder(reminder.id, user.id);
                  }
                }
              })
              .catch(err => console.error('Failed to check location reminders:', err));
          }
        } catch (bgError) {
          console.error('Background processing error (non-fatal):', bgError);
        }
      });
      
      return; // Ensure function exits cleanly
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to save memory. Please try again.", error);
    }
  });

  /**
   * PATCH /api/memories/:id - Update memory fields
   * Allows users to update category, importance, and text (with re-analysis)
   * When memoryText changes, triggers AI re-analysis for topic, mood, and importance
   * Requires authentication and ownership verification
   */
  app.patch("/api/memories/:id", requireAuth, aiLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const { topicTag, importance, memoryText, timezone } = req.body;
      const user = req.user as User;

      if (!id || typeof id !== 'string') {
        return sendErrorResponse(res, 400, "Memory ID is required");
      }

      // At least one field must be provided
      if (!topicTag && importance === undefined && !memoryText) {
        return sendErrorResponse(res, 400, "At least one field (topicTag, importance, or memoryText) is required");
      }

      // Validate topicTag if provided
      if (topicTag !== undefined && (typeof topicTag !== 'string' || topicTag.trim() === '')) {
        return sendErrorResponse(res, 400, "topicTag must be a non-empty string");
      }

      // Validate importance if provided (1-10)
      if (importance !== undefined) {
        const importanceNum = parseInt(importance, 10);
        if (isNaN(importanceNum) || importanceNum < 1 || importanceNum > 10) {
          return sendErrorResponse(res, 400, "importance must be a number between 1 and 10");
        }
      }

      // Get the existing memory to check for text changes
      const existingMemory = await storage.getLogEntry(id, user.id);
      if (!existingMemory) {
        return sendErrorResponse(res, 404, "Memory not found or you don't have permission to edit it");
      }

      // Build the update object
      const updateData: Partial<InsertLogEntry> = {};

      // If text changed, trigger re-analysis
      if (memoryText && memoryText !== existingMemory.memoryText) {
        // Re-analyze with AI to update topic, mood, people, and importance
        const extracted = await extractMetadata(memoryText, timezone);
        const newEmbedding = await generateEmbedding(memoryText);
        
        updateData.memoryText = memoryText;
        updateData.topicTag = topicTag || extracted.topicTag; // Use provided topicTag or AI-extracted
        updateData.metadataJson = extracted.metadataJson;
        updateData.embeddingVector = newEmbedding;
        updateData.mood = extracted.mood;
        updateData.moodScore = extracted.moodScore;
        updateData.detectedPeople = extracted.detectedPeople;
        updateData.aiReasoning = extracted.aiReasoning;
        // Use user-provided importance if given, otherwise use AI-extracted
        updateData.importance = importance !== undefined ? parseInt(importance, 10) : extracted.importance;

        // Auto-create category if needed
        if (updateData.topicTag) {
          await storage.createCategoryIfNotExists(user.id, updateData.topicTag);
        }
      } else {
        // No text change - just update the provided fields
        if (topicTag) {
          updateData.topicTag = topicTag;
          await storage.createCategoryIfNotExists(user.id, topicTag);
        }
        if (importance !== undefined) {
          updateData.importance = parseInt(importance, 10);
        }
      }

      // Update the memory (with user ownership verification)
      const updatedEntry = await storage.updateLogEntry(id, user.id, updateData);

      if (!updatedEntry) {
        return sendErrorResponse(res, 404, "Memory not found or you don't have permission to edit it");
      }

      res.json({
        status: 'success',
        data: updatedEntry,
        message: memoryText && memoryText !== existingMemory.memoryText 
          ? 'Memory updated and re-analyzed successfully' 
          : 'Memory updated successfully',
        reanalyzed: memoryText && memoryText !== existingMemory.memoryText,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update memory", error);
    }
  });

  /**
   * Detect if a query is about financial/spending data
   */
  function isFinancialQuery(query: string): boolean {
    const financialPatterns = [
      /\b(spend|spent|spending|purchase|bought|cost|expense|expenses)\b/i,
      /\b(balance|account|accounts|bank|money|dollar|dollars|\$)\b/i,
      /\b(transaction|transactions|payment|payments)\b/i,
      /\b(restaurant|groceries|shopping|bills|subscriptions?|recurring)\b/i,
      /\b(how much|total|category|categories|merchant|merchants)\b/i,
      /\b(financial|finances|budget|budgeting|plaid)\b/i,
    ];
    return financialPatterns.some(pattern => pattern.test(query));
  }

  /**
   * POST /api/memories/search - Hybrid search for memories
   * Combines semantic search with structured filters
   * Detects financial queries and routes them to financial analysis
   * Requires authentication
   */
  app.post("/api/memories/search", requireAuth, requireTier('pro'), aiLimiter, async (req, res) => {
    try {
      const { queryText } = req.body;
      const user = req.user as User;
      
      if (!queryText || typeof queryText !== 'string') {
        return sendErrorResponse(res, 400, "queryText is required");
      }

      // Check if this is a financial query
      const userSettings = await storage.getSettings(user.id);
      const isFinancial = isFinancialQuery(queryText);
      
      if (isFinancial) {
        // Check if Plaid is configured and enabled
        if (!isPlaidFeatureEnabled() || !userSettings?.plaidEnabled) {
          // Financial query detected but Plaid not enabled - inform user
          return res.json({
            status: 'success',
            isFinancial: true,
            financialAnswer: "I detected this as a financial question, but you haven't connected a bank account yet. Go to Settings and connect your bank through Plaid to get personalized spending insights and subscription tracking.",
            data: [],
            query: {
              original: queryText,
              type: 'financial'
            },
            count: 0,
            timestamp: new Date().toISOString()
          });
        }
        
        try {
          // Get recent transactions (30 days) and accounts for financial query
          const [transactions, accounts] = await Promise.all([
            plaidService.getRecentTransactions(user.id, 30, 100),
            plaidService.getAccounts(user.id)
          ]);

          if (transactions.length > 0 || accounts.length > 0) {
            // Format transaction data for AI (matching TransactionContext interface)
            const txContext = transactions.map(t => ({
              date: t.date,
              amount: t.amount,
              name: t.name,
              merchantName: t.merchantName,
              primaryCategory: t.primaryCategory
            }));

            const accountContext = accounts
              .filter(a => !a.isHidden)
              .map(a => ({
                name: a.name,
                type: a.type,
                currentBalance: a.currentBalance,
                availableBalance: a.availableBalance
              }));

            const financialAnswer = await answerFinancialQuery(queryText, txContext, accountContext, userSettings?.sassLevel ?? 50, userSettings?.professionalMode ?? false);

            return res.json({
              status: 'success',
              isFinancial: true,
              financialAnswer: financialAnswer.answer,
              financialSummary: financialAnswer.summary,
              data: [], // No memory results for financial queries
              query: {
                original: queryText,
                type: 'financial'
              },
              count: 0,
              timestamp: new Date().toISOString()
            });
          } else {
            // Plaid enabled but no transaction data synced yet
            return res.json({
              status: 'success',
              isFinancial: true,
              financialAnswer: "I don't have any transaction data to analyze yet. Please sync your bank account in Settings - it may take a few minutes for your transactions to appear after connecting.",
              data: [],
              query: {
                original: queryText,
                type: 'financial'
              },
              count: 0,
              timestamp: new Date().toISOString()
            });
          }
        } catch (finError) {
          console.error("Financial query failed:", finError);
          // Return clear error for financial queries instead of falling back
          return res.json({
            status: 'success',
            isFinancial: true,
            financialAnswer: "I had trouble accessing your financial data. Please try again in a moment, or check your bank connection in Settings.",
            data: [],
            query: {
              original: queryText,
              type: 'financial'
            },
            count: 0,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Run query decomposition and embedding generation in parallel for speed
      const [decomposed, queryVector] = await Promise.all([
        decomposeQuery(queryText),
        generateEmbedding(queryText)
      ]);
      
      const { semanticComponent, structuredFilters } = decomposed;

      // Perform vector similarity search (topicTag intentionally NOT passed as SQL filter)
      const results = await storage.searchMemories(
        user.id,
        queryVector,
        undefined, // topicTag excluded from SQL filter — vector similarity handles relevance
        structuredFilters.timestampFilter?.start,
        structuredFilters.timestampFilter?.end,
        structuredFilters.metadataFilters,
        10 // limit to top 10 results
      );

      // Generate a real AI synthesis answer using retrieved memories
      const memoriesForSynthesis = results
        .filter((r) => r.memoryText)
        .map((r) => ({ memoryText: r.memoryText as string, timestamp: r.timestamp, similarity: r.similarity }));
      const aiAnswer = await synthesizeSearchAnswer(queryText, memoriesForSynthesis, userSettings?.sassLevel ?? 50, userSettings?.professionalMode ?? false);

      res.json({
        status: 'success',
        aiAnswer,
        data: results,
        query: {
          original: queryText,
          semantic: semanticComponent,
          filters: structuredFilters,
        },
        count: results.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to search memories", error);
    }
  });

  /**
   * COMPANION APP ROUTES
   * MCP-compliant endpoints for React Native companion app
   * Handles voice-to-action with geolocation context
   */

  /**
   * POST /api/companion/action - Unified MCP action handler
   * Accepts MCP-compliant payloads from companion app
   * Routes to record or query based on action type
   * Enriches memories with geolocation and device context
   */
  app.post("/api/companion/action", requireAuth, requireTier('life_os'), aiLimiter, async (req, res) => {
    try {
      const payload = mcpPayloadSchema.parse(req.body);
      const user = req.user as User;

      if (payload.action === 'record') {
        // Handle memory recording with full context
        const extracted = await extractMetadata(payload.transcript, payload.metadata?.timezone);
        const embeddingVector = await generateEmbedding(payload.transcript);

        const logEntry = await storage.createLogEntry({
          userId: user.id,
          memoryText: payload.transcript,
          topicTag: extracted.topicTag,
          metadataJson: {
            ...extracted.metadataJson,
            ...payload.metadata,
          },
          embeddingVector,
          mood: extracted.mood,
          moodScore: extracted.moodScore,
          detectedPeople: extracted.detectedPeople,
          // Geolocation context
          geoLat: payload.geo?.lat,
          geoLng: payload.geo?.lng,
          geoPlaceId: payload.geo?.placeId,
          geoPlaceName: payload.geo?.placeName,
          geoAccuracyMeters: payload.geo?.accuracyMeters,
          // Device context
          deviceId: payload.device?.id,
          deviceType: payload.device?.type,
          deviceConnection: payload.device?.connection,
        });

        // Track people mentions
        if (extracted.detectedPeople.length > 0) {
          Promise.all(
            extracted.detectedPeople.map(name => storage.upsertPerson(user.id, name))
          ).catch(err => console.error("Failed to track people:", err));
        }
        
        // Store location in location_history table (non-blocking)
        if (payload.geo?.lat !== undefined && payload.geo?.lng !== undefined) {
          const lat = payload.geo.lat;
          const lng = payload.geo.lng;
          // Only store if valid coordinates (not NaN and within valid ranges)
          if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            storage.createLocationHistory({
              userId: user.id,
              latitude: lat,
              longitude: lng,
              timestamp: new Date(),
              placeName: payload.geo.placeName || undefined,
              placeId: payload.geo.placeId || undefined,
              source: 'memory',
              accuracyMeters: payload.geo.accuracyMeters || undefined,
            }).catch(err => console.error("Failed to save location history:", err));
          }
        }

        res.status(201).json({
          status: 'success',
          action: 'record',
          data: logEntry,
          confirmation: `Memory saved${payload.geo?.placeName ? ` at ${payload.geo.placeName}` : ''}`,
          timestamp: new Date().toISOString()
        });

      } else if (payload.action === 'query') {
        // Handle memory search with AI response
        const [decomposed, queryVector] = await Promise.all([
          decomposeQuery(payload.transcript),
          generateEmbedding(payload.transcript)
        ]);

        const { semanticComponent, structuredFilters } = decomposed;

        const results = await storage.searchMemories(
          user.id,
          queryVector,
          structuredFilters.topicTag,
          structuredFilters.timestampFilter?.start,
          structuredFilters.timestampFilter?.end,
          structuredFilters.metadataFilters,
          5 // Limit for voice response
        );

        // Generate a spoken summary of results
        let spokenResponse: string;
        if (results.length === 0) {
          spokenResponse = "I couldn't find any memories matching your query.";
        } else if (results.length === 1) {
          spokenResponse = `I found one memory: ${results[0].memoryText}`;
        } else {
          spokenResponse = `I found ${results.length} memories. The most recent one is: ${results[0].memoryText}`;
        }

        res.json({
          status: 'success',
          action: 'query',
          data: results,
          spokenResponse,
          query: {
            original: payload.transcript,
            semantic: semanticComponent,
            filters: structuredFilters,
          },
          count: results.length,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid MCP payload',
          errors: error.errors,
          timestamp: new Date().toISOString()
        });
      }
      sendErrorResponse(res, 500, "Failed to process companion action", error);
    }
  });

  /**
   * GET /api/logs - Get recent memories/log entries with pagination
   * Query params: limit (default 50), offset (default 0), full (include heavy data)
   * Returns memories ordered by timestamp with pagination info
   * Requires authentication
   */
  app.get("/api/logs", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Cap at 100
      const offset = parseInt(req.query.offset as string) || 0;
      const full = req.query.full === 'true';
      
      // Use light version for list views (excludes embeddings and heavy metadata)
      const rawEntries = full 
        ? await storage.getLogEntries(user.id, limit, offset)
        : await storage.getLogEntriesLight(user.id, limit, offset);
      
      // Sanitize: exclude embeddingVector from all entries
      const entries = rawEntries.map(entry => {
        const { embeddingVector: _, ...sanitized } = entry as any;
        return sanitized;
      });
      
      // Get total count for pagination (only if offset is 0 to reduce queries)
      const total = offset === 0 ? await storage.getLogEntriesCount(user.id) : undefined;
      
      res.json({
        status: 'success',
        data: entries,
        count: entries.length,
        total,
        limit,
        offset,
        hasMore: entries.length === limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch log entries", error);
    }
  });

  /**
   * POST /api/logs - Create a log entry directly (without AI processing)
   * Useful for testing, importing data, or manual creation
   * Requires authentication
   */
  app.post("/api/logs", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { memoryText, topicTag, metadataJson } = req.body;
      
      if (!memoryText || typeof memoryText !== 'string') {
        return sendErrorResponse(res, 400, "memoryText is required");
      }
      
      // Generate embedding for semantic search (if not provided)
      const embeddingVector = req.body.embeddingVector || await generateEmbedding(memoryText);
      
      const logEntry = await storage.createLogEntry({
        userId: user.id,
        memoryText,
        topicTag: topicTag || "General",
        metadataJson: metadataJson || {},
        embeddingVector,
      });
      
      // Sanitize response: exclude embeddingVector (large array) to prevent serialization issues
      const { embeddingVector: _, ...sanitizedEntry } = logEntry;
      
      // Send response immediately before any side effects
      res.status(201).json({
        status: 'success',
        data: sanitizedEntry,
        timestamp: new Date().toISOString()
      });
      
      // Invalidate AI cache in background (after response sent)
      storage.invalidateAiCache(user.id).catch(err => {
        console.error('Background cache invalidation failed:', err);
      });
      
      return; // Ensure no further processing
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create log entry", error);
    }
  });

  /**
   * GET /api/logs/:id - Get specific log entry
   * Requires authentication
   */
  app.get("/api/logs/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }
      
      const entry = await storage.getLogEntry(id, user.id);
      
      if (!entry) {
        return sendErrorResponse(res, 404, "Log entry not found");
      }
      
      // Sanitize response: exclude embeddingVector
      const { embeddingVector: _, ...sanitizedEntry } = entry;
      
      res.json({
        status: 'success',
        data: sanitizedEntry,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch log entry", error);
    }
  });

  /**
   * PATCH /api/logs/:id - Update log entry
   * Requires authentication
   * Regenerates embedding only if memoryText changes (performance optimization)
   */
  app.patch("/api/logs/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }

      // Validate update data (partial schema)
      const updateData = { ...req.body };
      
      // Ensure metadataJson is never null (DB constraint: NOT NULL)
      if (updateData.metadataJson === null) {
        updateData.metadataJson = {};
      }
      
      // If memoryText is being updated, check if it actually changed
      if (updateData.memoryText) {
        const existingEntry = await storage.getLogEntry(id, user.id);
        if (!existingEntry) {
          return sendErrorResponse(res, 404, "Log entry not found");
        }
        
        // Only regenerate embedding if text actually changed
        if (updateData.memoryText !== existingEntry.memoryText) {
          const newEmbedding = await generateEmbedding(updateData.memoryText);
          if (!newEmbedding.every(v => v === 0)) {
            updateData.embeddingVector = newEmbedding;
          }
        }
      }
      
      const updated = await storage.updateLogEntry(id, user.id, updateData);
      
      if (!updated) {
        return sendErrorResponse(res, 404, "Log entry not found");
      }
      
      // Sanitize response: exclude embeddingVector
      const { embeddingVector: _, ...sanitizedEntry } = updated;
      
      // Send response immediately
      res.json({
        status: 'success',
        data: sanitizedEntry,
        message: 'Log entry updated successfully',
        timestamp: new Date().toISOString()
      });
      
      // Invalidate AI cache in background (after response sent)
      storage.invalidateAiCache(user.id).catch(err => {
        console.error('Background cache invalidation failed:', err);
      });
      
      return;
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update log entry", error);
    }
  });

  /**
   * DELETE /api/logs/:id - Delete log entry
   * Requires authentication
   */
  app.delete("/api/logs/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }
      
      const deleted = await storage.deleteLogEntry(id, user.id);
      
      if (!deleted) {
        return sendErrorResponse(res, 404, "Log entry not found");
      }
      
      // Invalidate AI cache when memory is deleted
      await storage.invalidateAiCache(user.id);
      
      res.json({
        status: 'success',
        message: 'Log entry deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete log entry", error);
    }
  });

  /**
   * SETTINGS ROUTES
   * Handle application settings management
   */
  
  /**
   * GET /api/settings - Get current settings
   * Requires authentication
   */
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const currentSettings = await storage.getSettings(user.id);
      
      res.json({
        status: 'success',
        data: currentSettings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch settings", error);
    }
  });

  /**
   * PUT /api/settings - Update settings
   * Requires authentication
   */
  app.put("/api/settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      // Remove internal fields that shouldn't be updated via this endpoint
      const { 
        telegramVerificationExpires, 
        telegramVerificationCode,
        telegramChatId,
        createdAt,
        updatedAt,
        id,
        userId,
        ...userEditableSettings 
      } = req.body;
      
      const settingsData = insertSettingsSchema.partial().parse(userEditableSettings);
      const updated = await storage.updateSettings(user.id, settingsData);
      
      res.json({
        status: 'success',
        data: updated,
        message: 'Settings updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid settings data", 
          errors: error.errors,
          timestamp: new Date().toISOString()
        });
      }
      
      sendErrorResponse(res, 500, "Failed to update settings", error);
    }
  });

  /**
   * CALENDAR ROUTES
   * Handle calendar integration
   */

  /**
   * GET /api/calendar/status - Check if calendar is connected
   * Returns status for both Google and Outlook providers
   */
  app.get("/api/calendar/status", requireAuth, async (req, res) => {
    try {
      const [googleConnected, outlookConnected] = await Promise.all([
        isGoogleCalendarConnected(),
        isOutlookConnected()
      ]);
      
      // Active provider (Google preferred when both connected)
      const activeProvider = googleConnected ? 'google' : outlookConnected ? 'outlook' : null;
      
      res.json({
        status: 'success',
        connected: activeProvider !== null,
        provider: activeProvider,
        google: googleConnected,
        outlook: outlookConnected,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({
        status: 'success',
        connected: false,
        provider: null,
        google: false,
        outlook: false,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/email/status - Check if email services are connected
   * Returns status for both Gmail and Outlook Mail
   */
  app.get("/api/email/status", requireAuth, async (req, res) => {
    try {
      const [gmailConnected, outlookConnected] = await Promise.all([
        isGmailConnected(),
        isOutlookMailConnected()
      ]);
      
      // Active provider (Gmail preferred when both connected)
      const activeProvider = gmailConnected ? 'gmail' : outlookConnected ? 'outlook' : null;
      
      res.json({
        status: 'success',
        connected: activeProvider !== null,
        provider: activeProvider,
        gmail: gmailConnected,
        outlook: outlookConnected,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({
        status: 'success',
        connected: false,
        provider: null,
        gmail: false,
        outlook: false,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/providers/status - Get combined status of all providers
   * Returns calendar and email connection status for all providers
   * Respects user's saved preferences for active provider selection
   */
  app.get("/api/providers/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      // Fetch connection status and user settings in parallel
      const [googleCalendar, outlookCalendar, gmail, outlookMail, userSettings, gmailCaps] = await Promise.all([
        isGoogleCalendarConnected(),
        isOutlookConnected(),
        isGmailConnected(),
        isOutlookMailConnected(),
        storage.getSettings(user.id),
        getGmailCapabilities()
      ]);
      
      // Check user's enabled/disabled settings for each provider
      const googleCalendarUserEnabled = userSettings?.googleCalendarEnabled !== false;
      const outlookCalendarUserEnabled = userSettings?.outlookCalendarEnabled !== false;
      const gmailUserEnabled = userSettings?.gmailEnabled !== false;
      const outlookMailUserEnabled = userSettings?.outlookMailEnabled !== false;
      
      // Effective availability = connected AND user-enabled
      const googleCalendarAvailable = googleCalendar && googleCalendarUserEnabled;
      const outlookCalendarAvailable = outlookCalendar && outlookCalendarUserEnabled;
      const gmailAvailable = gmail && gmailUserEnabled;
      const outlookMailAvailable = outlookMail && outlookMailUserEnabled;
      
      // Determine active calendar provider based on user preference, then fallback to availability
      let activeCalendarProvider: string | null = null;
      if (userSettings?.calendarProvider) {
        // User has a preference - use it if that provider is connected AND enabled
        if (userSettings.calendarProvider === 'google' && googleCalendarAvailable) {
          activeCalendarProvider = 'google';
        } else if (userSettings.calendarProvider === 'outlook' && outlookCalendarAvailable) {
          activeCalendarProvider = 'outlook';
        }
      }
      // Fallback: auto-detect from available providers (prefer Google when both available)
      if (!activeCalendarProvider) {
        activeCalendarProvider = googleCalendarAvailable ? 'google' : outlookCalendarAvailable ? 'outlook' : null;
      }
      
      // Determine active email provider based on user preference, then fallback to availability
      let activeEmailProvider: string | null = null;
      if (userSettings?.emailProvider) {
        // User has a preference - use it if that provider is connected AND enabled
        if (userSettings.emailProvider === 'gmail' && gmailAvailable) {
          activeEmailProvider = 'gmail';
        } else if (userSettings.emailProvider === 'outlook' && outlookMailAvailable) {
          activeEmailProvider = 'outlook';
        }
      }
      // Fallback: auto-detect from available providers (prefer Gmail when both available)
      if (!activeEmailProvider) {
        activeEmailProvider = gmailAvailable ? 'gmail' : outlookMailAvailable ? 'outlook' : null;
      }
      
      res.json({
        status: 'success',
        calendar: {
          google: googleCalendar,
          outlook: outlookCalendar,
          activeProvider: activeCalendarProvider,
          userPreference: userSettings?.calendarProvider || null,
        },
        email: {
          gmail: gmail,
          outlook: outlookMail,
          activeProvider: activeEmailProvider,
          userPreference: userSettings?.emailProvider || null,
          enabled: userSettings?.emailIntegrationEnabled !== false,
          capabilities: {
            gmail: { send: gmailCaps.canSend, read: gmailCaps.canRead },
            outlook: { send: true, read: true },
          },
          gmailLimitation: gmailCaps.message || null,
        },
        providerSelectionMode: userSettings?.providerSelectionMode || 'default',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({
        status: 'success',
        calendar: { google: false, outlook: false, activeProvider: null, userPreference: null },
        email: { 
          gmail: false, 
          outlook: false, 
          activeProvider: null, 
          userPreference: null, 
          enabled: true,
          capabilities: {
            gmail: { send: false, read: false },
            outlook: { send: true, read: true },
          },
          gmailLimitation: null,
        },
        providerSelectionMode: 'default',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/calendar/events/today - Get today's calendar events
   */
  app.get("/api/calendar/events/today", requireAuth, async (req, res) => {
    try {
      const events = await getTodaysEvents();
      res.json({
        status: 'success',
        data: events,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch calendar events", error);
    }
  });

  /**
   * GET /api/calendar/events/current - Get current/relevant event
   */
  app.get("/api/calendar/events/current", requireAuth, async (req, res) => {
    try {
      const event = await findRelevantEvent(new Date());
      res.json({
        status: 'success',
        data: event,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch current event", error);
    }
  });

  /**
   * POST /api/calendar/events/detect - Detect calendar event from memory text
   * Uses AI to analyze if text describes a future event
   */
  app.post("/api/calendar/events/detect", requireAuth, aiLimiter, async (req, res) => {
    try {
      const validation = calendarEventDetectSchema.safeParse(req.body);
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      const { memoryText, timezone } = validation.data;

      const detectedEvent = await detectCalendarEvent(memoryText, new Date(), timezone ?? 'UTC');
      
      res.json({
        status: 'success',
        data: detectedEvent,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to detect calendar event", error);
    }
  });

  /**
   * POST /api/calendar/events/create - Create a new calendar event
   * Also checks for duplicate events before creating
   */
  app.post("/api/calendar/events/create", requireAuth, async (req, res) => {
    try {
      const validation = calendarEventCreateSchema.safeParse(req.body);
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      const { title, startDateTime, endDateTime, attendees, location, description, memoryId, timezone } = validation.data;

      // Check if calendar is connected
      const connected = await isCalendarConnected();
      if (!connected) {
        return sendErrorResponse(res, 400, "Google Calendar is not connected");
      }

      // Check for duplicate event
      const duplicate = await findDuplicateEvent(title, startDateTime);
      if (duplicate) {
        return res.json({
          status: 'success',
          data: {
            created: false,
            duplicate: true,
            existingEvent: duplicate,
          },
          message: 'A similar event already exists',
          timestamp: new Date().toISOString()
        });
      }

      // Create the event with user's timezone for correct time interpretation
      const createdEvent = await createCalendarEvent(title, startDateTime, endDateTime, {
        attendees,
        location,
        description,
        timezone,
      });

      if (!createdEvent) {
        return sendErrorResponse(res, 500, "Failed to create calendar event");
      }

      // If memoryId provided, link the event back to the memory
      if (memoryId) {
        const user = req.user as User;
        try {
          await storage.updateLogEntry(memoryId, user.id, {
            calendarEventId: createdEvent.id,
            calendarEventTitle: createdEvent.title,
            calendarEventAttendees: createdEvent.attendees || [],
          });
        } catch (linkError) {
          console.error("Failed to link event to memory:", linkError);
          // Don't fail the whole request if linking fails
        }
      }

      res.status(201).json({
        status: 'success',
        data: {
          created: true,
          duplicate: false,
          event: createdEvent,
        },
        message: 'Calendar event created successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create calendar event", error);
    }
  });

  /**
   * POST /api/calendar/events/check-duplicate - Check if similar event exists
   */
  app.post("/api/calendar/events/check-duplicate", requireAuth, async (req, res) => {
    try {
      const validation = calendarDuplicateCheckSchema.safeParse(req.body);
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      const { title, startDateTime } = validation.data;

      const duplicate = await findDuplicateEvent(title, startDateTime);
      
      res.json({
        status: 'success',
        data: {
          exists: !!duplicate,
          event: duplicate,
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to check for duplicate event", error);
    }
  });

  /**
   * CATEGORY ROUTES
   * Handle user-defined categories
   */
  
  /**
   * GET /api/categories - Get all categories for the user
   * Requires authentication
   */
  app.get("/api/categories", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const userCategories = await storage.getCategories(user.id);
      
      res.json({
        status: 'success',
        data: userCategories,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch categories", error);
    }
  });

  /**
   * POST /api/categories - Create a new category
   * Requires authentication
   */
  app.post("/api/categories", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { name } = insertCategorySchema.parse(req.body);
      
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return sendErrorResponse(res, 400, "Category name is required and must be non-empty");
      }
      
      const category = await storage.createCategoryIfNotExists(user.id, name.trim());
      
      res.status(201).json({
        status: 'success',
        data: category,
        message: 'Category created successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to create category:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid category data", 
          errors: error.errors,
          timestamp: new Date().toISOString()
        });
      }
      
      sendErrorResponse(res, 500, "Failed to create category", error);
    }
  });

  /**
   * PEOPLE TRACKING ROUTES
   * Handle people mentioned in memories
   */

  /**
   * GET /api/people - Get all tracked people for the user
   * Requires authentication
   * Automatically syncs mention counts before returning data
   */
  app.get("/api/people", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      // Sync mention counts to ensure accuracy
      await storage.syncPeopleMentionCounts(user.id);
      
      const userPeople = await storage.getPeople(user.id);
      
      res.json({
        status: 'success',
        data: userPeople,
        count: userPeople.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch people", error);
    }
  });

  /**
   * GET /api/people/:name/mentions - Get all memories mentioning a person
   * Requires authentication
   */
  app.get("/api/people/:name/mentions", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { name } = req.params;
      
      if (!name) {
        return sendErrorResponse(res, 400, "Person name is required");
      }

      const decodedName = decodeURIComponent(name);
      const person = await storage.getPerson(user.id, decodedName);
      const aliases = person?.aliases || [];
      
      const mentions = await storage.getPersonMentions(user.id, decodedName, aliases);
      
      res.json({
        status: 'success',
        data: mentions,
        count: mentions.length,
        personName: decodedName,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch person mentions", error);
    }
  });

  /**
   * PATCH /api/people/:id - Update a person's details
   * Requires authentication
   */
  app.patch("/api/people/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const updateData = insertPersonSchema.partial().parse(req.body);

      if (updateData.name) {
        const existingWithName = await storage.getPerson(user.id, updateData.name);
        if (existingWithName && existingWithName.id !== id) {
          const currentPerson = await storage.getPersonById(user.id, id);
          if (!currentPerson) {
            return sendErrorResponse(res, 404, "Person not found");
          }

          const merged = await storage.mergePersonRecords(user.id, existingWithName, currentPerson, updateData);

          return res.json({
            status: 'success',
            data: merged,
            message: `Merged with existing "${updateData.name}" record`,
            merged: true,
            timestamp: new Date().toISOString()
          });
        }
      }

      const updated = await storage.updatePerson(user.id, id, updateData);
      
      if (!updated) {
        return sendErrorResponse(res, 404, "Person not found");
      }
      
      res.json({
        status: 'success',
        data: updated,
        message: 'Person updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to update person:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid person data", 
          errors: error.errors,
          timestamp: new Date().toISOString()
        });
      }
      
      sendErrorResponse(res, 500, "Failed to update person", error);
    }
  });

  /**
   * DELETE /api/people/:id - Delete a person entry
   * Requires authentication
   */
  app.delete("/api/people/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const deleted = await storage.deletePerson(user.id, id);
      
      if (!deleted) {
        return sendErrorResponse(res, 404, "Person not found");
      }
      
      res.json({
        status: 'success',
        message: 'Person deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete person", error);
    }
  });

  /**
   * POST /api/people/merge - Merge multiple people into one
   * Consolidates nicknames, variations, and duplicates into a single person
   * Updates all memories to reference the target person
   */
  const mergeSchema = z.object({
    targetId: z.string().min(1, "Target person ID required"),
    sourceIds: z.array(z.string()).min(1, "At least one source person ID required"),
  });
  
  app.post("/api/people/merge", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const validation = mergeSchema.safeParse(req.body);
      
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      
      const { targetId, sourceIds } = validation.data;
      
      if (sourceIds.includes(targetId)) {
        return sendErrorResponse(res, 400, "Target person cannot be in source list");
      }
      
      const result = await storage.mergePeople(user.id, targetId, sourceIds);
      
      res.json({
        status: 'success',
        message: `Merged ${result.merged} people, updated ${result.updatedMemories} memories`,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to merge people", error);
    }
  });

  const aiSearchSchema = z.object({
    query: z.string().min(1, "Search query is required").max(500, "Query too long"),
  });

  const VALID_SORT_FIELDS = ['name', 'relationship', 'priority', 'mentionCount', 'source', 'lastMentioned', 'firstMentioned'] as const;

  app.post("/api/people/find-duplicates", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const allPeople = await storage.getPeople(user.id);

      if (allPeople.length < 2) {
        return res.json({ status: 'success', data: { groups: [], message: 'Not enough people to find duplicates.' } });
      }

      const peopleSummary = allPeople.slice(0, 500).map(p => ({
        id: p.id,
        name: p.name,
        phoneNumber: p.phoneNumber || null,
        relationship: p.relationship || 'unset',
        priority: p.priority,
        mentionCount: p.mentionCount,
        source: p.source || 'memory',
        notes: p.notes || '',
      }));

      const validPeopleIds = new Set(allPeople.map(p => p.id));

      const openaiClient = openai;

      const response = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a duplicate detection assistant for a people/contacts database. Analyze the list of people and find likely duplicates or records that should be merged.

Look for:
1. Similar names (e.g., "Mike" and "Michael Smith", "Bob" and "Robert", nicknames vs full names)
2. Same phone number across different records
3. Very similar names with different spellings (e.g., "Jon" and "John")
4. First-name-only records that likely match a full-name record
5. Records that appear to be the same person from different sources

Return a JSON object with:
- "groups": array of duplicate groups, each containing:
  - "ids": array of person IDs in this group (2 or more)
  - "reason": brief explanation of why these are likely duplicates
  - "suggestedTargetId": the ID of the record that should be kept as the primary (prefer the record with: most data, full name over nickname, highest mention count)
  - "confidence": "high" | "medium" | "low" based on how confident you are they're the same person
- "message": summary of findings

Rules:
- Only include genuine likely duplicates, don't force matches
- A person can only appear in one group
- Prefer "high" confidence for exact phone matches or very similar names
- Prefer "medium" for plausible name variations
- "low" for uncertain matches
- Sort groups by confidence (high first)
- If no duplicates found, return empty groups array

Respond with JSON only.`
          },
          {
            role: "user",
            content: `Find potential duplicates in these ${allPeople.length} people records:\n${JSON.stringify(peopleSummary)}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      let result: { groups?: DuplicateGroupJSON[]; message?: string };
      try {
        result = JSON.parse(response.choices[0].message.content || "{}");
      } catch {
        return res.json({ status: 'success', data: { groups: [], message: 'Could not analyze records for duplicates.' } });
      }

      const groups = Array.isArray(result.groups) ? result.groups.filter((g) => {
        if (!Array.isArray(g.ids) || g.ids.length < 2) return false;
        return g.ids.every((id: string) => typeof id === 'string' && validPeopleIds.has(id));
      }).map((g) => ({
        ids: g.ids!,
        reason: typeof g.reason === 'string' ? g.reason.slice(0, 200) : 'Possible duplicate',
        suggestedTargetId: typeof g.suggestedTargetId === 'string' && validPeopleIds.has(g.suggestedTargetId) ? g.suggestedTargetId : g.ids![0],
        confidence: ['high', 'medium', 'low'].includes(g.confidence ?? '') ? g.confidence! : 'medium',
      })) : [];

      res.json({
        status: 'success',
        data: {
          groups,
          message: typeof result.message === 'string' ? result.message.slice(0, 300) : `Found ${groups.length} potential duplicate group(s).`,
        }
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Duplicate detection failed", error);
    }
  });

  app.post("/api/people/ai-search", requireAuth, requireTier('pro'), aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const validation = aiSearchSchema.safeParse(req.body);
      
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }

      const { query } = validation.data;

      const allPeople = await storage.getPeople(user.id);
      
      if (allPeople.length === 0) {
        return res.json({ status: 'success', data: { sortField: 'name', sortDirection: 'asc', filterIds: null, message: 'No people records found.' } });
      }

      const validPeopleIds = new Set(allPeople.map(p => p.id));

      const peopleSummary = allPeople.slice(0, 500).map(p => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship || 'unset',
        priority: p.priority,
        mentionCount: p.mentionCount,
        source: p.source || 'memory',
        lastMentioned: p.lastMentioned?.toISOString().split('T')[0] || 'unknown',
        firstMentioned: p.firstMentioned?.toISOString().split('T')[0] || 'unknown',
      }));

      const openaiClient = openai;

      const response = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a search/sort/filter assistant for a people management system. The user has ${allPeople.length} people records.

Available fields for sorting: name, relationship, priority (closeness score 1-10, 10=closest), mentionCount, source, lastMentioned, firstMentioned
Available relationships: friend, family, colleague, client, acquaintance, partner, mentor, other, unset
Available sources: memory (from voice/text memories), messages (from text message imports), both (appears in both), manual (manually created)

Given the user's natural language query, return a JSON object with:
- "sortFields": an array of sort criteria, each with { "field": string, "direction": "asc" | "desc" }. Use multiple entries for multi-field sorts (e.g., group by relationship then sort by closeness). Order matters: first entry is primary sort, second is tiebreaker, etc. Use an empty array [] if no sort needed.
- "filterIds": array of matching person IDs if filtering/searching, or null if showing all (just sorting)
- "message": a brief friendly description of what you did (e.g., "Grouped by relationship, then sorted by closeness within each group")

IMPORTANT RULES:
- For search queries (finding specific people), return only matching IDs in filterIds
- For sort queries, set filterIds to null (show all, just reorder)
- For filter queries (e.g., "show family"), return matching IDs in filterIds
- For combined queries (e.g., "family sorted by mentions"), filter AND sort
- "closest" or "most important" = highest priority (desc)
- "most mentioned" = highest mentionCount (desc)
- "recently mentioned" = lastMentioned desc
- "neglected" or "haven't talked to" = lastMentioned asc or low mentionCount
- "group by relationship" = sort by relationship first, then by the next criterion
- Multi-field sorts: e.g., "sort by relationship then closeness" → sortFields: [{"field":"relationship","direction":"asc"},{"field":"priority","direction":"desc"}]
- If the query is ambiguous, do your best interpretation
- Always provide a helpful message explaining the result

Respond with JSON only.`
          },
          {
            role: "user",
            content: `Query: "${query.trim()}"\n\nPeople data:\n${JSON.stringify(peopleSummary)}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      let result: any;
      try {
        result = JSON.parse(response.choices[0].message.content || "{}");
      } catch {
        return res.json({
          status: 'success',
          data: { sortFields: [{ field: 'name', direction: 'asc' as const }], filterIds: null, message: 'Could not interpret query. Showing all people alphabetically.' }
        });
      }

      const sortFields: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
      if (Array.isArray(result.sortFields)) {
        for (const sf of result.sortFields) {
          if (sf && typeof sf.field === 'string' && (VALID_SORT_FIELDS as readonly string[]).includes(sf.field)) {
            sortFields.push({
              field: sf.field,
              direction: sf.direction === 'desc' ? 'desc' : 'asc',
            });
          }
        }
      } else if (result.sortField && (VALID_SORT_FIELDS as readonly string[]).includes(result.sortField)) {
        sortFields.push({
          field: result.sortField,
          direction: result.sortDirection === 'desc' ? 'desc' : 'asc',
        });
      }

      const filterIds = Array.isArray(result.filterIds)
        ? result.filterIds.filter((id: string) => typeof id === 'string' && validPeopleIds.has(id))
        : null;

      res.json({
        status: 'success',
        data: {
          sortFields,
          filterIds: filterIds && filterIds.length > 0 ? filterIds : (Array.isArray(result.filterIds) ? [] : null),
          message: typeof result.message === 'string' ? result.message.slice(0, 200) : 'Search complete',
        }
      });
    } catch (error) {
      sendErrorResponse(res, 500, "AI search failed", error);
    }
  });

  /**
   * MOOD ANALYTICS ROUTES
   * Analyze emotional patterns in memories
   */

  /**
   * GET /api/mood/stats - Get mood statistics for the user
   * Query params: days (default 30)
   * Requires authentication
   */
  app.get("/api/mood/stats", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const days = parseInt(req.query.days as string) || 30;
      
      const stats = await storage.getMoodStats(user.id, days);
      
      res.json({
        status: 'success',
        data: stats,
        period: `Last ${days} days`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch mood stats", error);
    }
  });

  /**
   * GET /api/mood/trend - Get daily mood trend for line chart
   * Query params: days (default 30)
   * Requires authentication
   */
  app.get("/api/mood/trend", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const days = parseInt(req.query.days as string) || 30;
      const userSettings = await storage.getSettings(user.id);
      const userTimezone = userSettings?.userTimezone || 'America/Denver';
      
      const trend = await storage.getMoodTrend(user.id, days, userTimezone);
      
      res.json({
        status: 'success',
        data: trend,
        period: `Last ${days} days`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch mood trend", error);
    }
  });

  /**
   * GET /api/topics/frequency - Get topic frequency for visualization
   * Query params: days (default 30)
   * Requires authentication
   */
  app.get("/api/topics/frequency", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const days = parseInt(req.query.days as string) || 30;
      
      const frequency = await storage.getTopicFrequency(user.id, days);
      
      res.json({
        status: 'success',
        data: frequency,
        period: `Last ${days} days`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch topic frequency", error);
    }
  });

  /**
   * GET /api/mood/:mood - Get all memories with a specific mood
   * Requires authentication
   */
  app.get("/api/mood/:mood", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { mood } = req.params;
      
      if (!mood) {
        return sendErrorResponse(res, 400, "Mood is required");
      }
      
      const entries = await storage.getEntriesByMood(user.id, mood);
      
      res.json({
        status: 'success',
        data: entries,
        count: entries.length,
        mood,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch entries by mood", error);
    }
  });

  /**
   * TIME CAPSULE ROUTES
   * Surface memories from this day in previous years
   */

  /**
   * GET /api/timecapsule - Get "On This Day" memories
   * Requires authentication
   */
  app.get("/api/timecapsule", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const userSettings = await storage.getSettings(user.id);
      const userTimezone = userSettings?.userTimezone || 'America/Denver';
      const memories = await storage.getOnThisDayMemories(user.id, userTimezone);
      
      const now = new Date();
      const localMonth = parseInt(now.toLocaleString('en-US', { timeZone: userTimezone, month: 'numeric' }));
      const localDay = parseInt(now.toLocaleString('en-US', { timeZone: userTimezone, day: 'numeric' }));
      
      res.json({
        status: 'success',
        data: memories,
        count: memories.length,
        date: {
          month: localMonth,
          day: localDay,
        },
        message: memories.length > 0 
          ? `Found ${memories.length} memories from this day in previous years`
          : "No memories from this day in previous years yet",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch time capsule memories", error);
    }
  });

  /**
   * INSIGHTS ROUTES
   * AI-powered thematic synthesis and pattern analysis
   */

  /**
   * POST /api/insights - Generate AI insights from memories
   * Body: { question?: string, days?: number }
   * Requires authentication
   */
  app.post("/api/insights", requireAuth, requireTier('pro'), aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const validation = insightsQuerySchema.safeParse(req.body);
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      const { question, days } = validation.data;
      
      // Get recent memories for analysis (use light version - no embeddings needed)
      const memories = await storage.getRecentLogEntriesLight(user.id, days, 100);
      
      // No filtering needed - getRecentLogEntriesLight already filters by days
      const filteredMemories = memories;
      
      if (filteredMemories.length === 0) {
        return res.json({
          status: 'success',
          data: {
            summary: "No memories found in the specified time period.",
            patterns: [],
            recommendations: ["Try adding more memories to get personalized insights."],
            timespan: `Last ${days} days`,
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Fetch active goals for context
      const goals = await storage.getGoals(user.id);
      const activeGoals = goals
        .filter(g => g.status === 'active')
        .map(g => ({
          title: g.title,
          description: g.description,
          progressPercent: g.progressPercent,
          targetDate: g.targetDate?.toISOString() || null,
          status: g.status,
        }));

      // Get user timezone from settings
      const userSettings = await storage.getSettings(user.id);
      const userTimezone = userSettings?.userTimezone || 'America/Denver';

      // Generate insights - filter and type-guard the light memories
      const insights = await generateThematicInsights(
        filteredMemories
          .filter(m => m.memoryText && m.timestamp && m.topicTag)
          .map(m => ({
            memoryText: m.memoryText!,
            mood: m.mood || undefined,
            moodScore: m.moodScore || undefined,
            timestamp: m.timestamp!,
            topicTag: m.topicTag!,
          })),
        question,
        activeGoals.length > 0 ? activeGoals : undefined,
        userTimezone,
        userSettings?.sassLevel ?? 50,
        userSettings?.professionalMode ?? false
      );
      
      res.json({
        status: 'success',
        data: insights,
        memoriesAnalyzed: filteredMemories.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to generate insights", error);
    }
  });

  /**
   * ==========================================
   * Phase 2: Proactive Features
   * ==========================================
   */

  /**
   * GET /api/briefing - Generate personalized morning/daily briefing
   * 
   * Returns an AI-generated summary of recent memories with focus areas,
   * reminders, mood trends, email highlights, and an encouraging affirmation.
   * Uses caching to avoid regenerating on every request (30-minute TTL).
   */
  app.get("/api/briefing", requireAuth, requireTier('pro'), aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const localHour = parseInt(req.query.localHour as string) || new Date().getHours();
      const forceRefresh = req.query.refresh === 'true';
      const queryTimezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;
      
      // Cache key based on user's LOCAL date (not UTC) to avoid wrong day boundary
      const settingsForCache = await storage.getSettings(user.id);
      const briefingTimezone = queryTimezone || settingsForCache?.userTimezone || 'America/Denver';
      const today = formatDateForTimezone(new Date(), briefingTimezone);
      const cacheKey = `${today}-${briefingTimezone}`;
      
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = await storage.getAiCache(user.id, 'briefing', cacheKey);
        if (cached) {
          // Check if memory count has changed significantly
          const currentCount = await storage.getLogEntriesCount(user.id);
          const latestTimestamp = await storage.getLatestMemoryTimestamp(user.id);
          const cacheTime = new Date(cached.generatedAt).getTime();
          const latestTime = latestTimestamp?.getTime() || 0;
          
          // Return cached if no new memories since cache was generated
          if (latestTime <= cacheTime && Math.abs(currentCount - (cached.memoriesCount || 0)) < 3) {
            return res.json({
              status: 'success',
              data: cached.data,
              memoriesAnalyzed: cached.memoriesCount,
              emailsAnalyzed: 0,
              telegramSent: false,
              cached: true,
              generatedAt: cached.generatedAt.toISOString()
            });
          }
        }
      }
      
      // OPTIMIZED: Fetch independent data sources in parallel (reuse settings from cache key check)
      const [recentMemories, userPeople] = await Promise.all([
        storage.getRecentLogEntriesLight(user.id, 7, 100),
        storage.getPeople(user.id)
      ]);
      const userSettings = settingsForCache;
      
      const activeProjects = userSettings?.activeProjects || undefined;
      const knownPeople = userPeople.map(p => ({
        name: p.name,
        relationship: p.relationship,
        notes: p.notes,
      }));
      
      // OPTIMIZED: Fetch email and financial in parallel (both depend on settings)
      const preferredEmailProvider = userSettings?.emailProvider;
      const shouldFetchFinancial = isPlaidFeatureEnabled() && userSettings?.plaidEnabled && userSettings?.plaidIncludeInBriefings;
      
      // Helper to fetch emails
      const fetchEmails = async (): Promise<{ emails: Array<{ subject: string; from: string; snippet: string; date: Date }>; source: string | null }> => {
        try {
          if (!preferredEmailProvider || preferredEmailProvider === 'gmail') {
            const gmailConnected = await isGmailConnected();
            if (gmailConnected) {
              const gmailCaps = await getGmailCapabilities();
              if (gmailCaps.canRead) {
                const emails = await getRecentEmails(10);
                const mapped = emails.map(e => ({ subject: e.subject, from: e.from, snippet: e.snippet, date: e.date }));
                if (mapped.length > 0) return { emails: mapped, source: 'gmail' };
              }
            }
          }
          if (!preferredEmailProvider || preferredEmailProvider === 'outlook') {
            const outlookConnected = await isOutlookMailConnected();
            if (outlookConnected) {

              const emails = await getOutlookRecentEmails(10);
              const mapped = emails.map(e => ({ subject: e.subject, from: e.from, snippet: e.snippet, date: e.date }));
              if (mapped.length > 0) return { emails: mapped, source: 'outlook' };
            }
          }
        } catch (err) { console.warn('Briefing: email fetch failed:', err instanceof Error ? err.message : err); }
        return { emails: [], source: null };
      };
      
      const fetchFinancial = async (): Promise<{ totalSpending: number; transactionCount: number; categoryBreakdown: Array<{ category: string; amount: number }>; topMerchants: Array<{ merchant: string; amount: number }> } | undefined> => {
        if (!shouldFetchFinancial) return undefined;
        try {
          const rawSummary = await plaidService.getSpendingSummary(user.id, 7);
          if (rawSummary && rawSummary.transactionCount > 0) {
            return {
              totalSpending: rawSummary.totalSpending,
              transactionCount: rawSummary.transactionCount,
              categoryBreakdown: rawSummary.categoryBreakdown,
              topMerchants: rawSummary.topMerchants
            };
          }
        } catch (err) { console.warn('Briefing: financial fetch failed:', err instanceof Error ? err.message : err); }
        return undefined;
      };
      
      const fetchLocationContext = async (): Promise<string | undefined> => {
        try {

          const [frequentPlaces, recentLocations, totalCount] = await Promise.all([
            storage.getFrequentPlaces(user.id),
            storage.getRecentLocations(user.id, 7, 50),
            storage.getLocationHistoryCount(user.id)
          ]);
          if (frequentPlaces.length > 0 || recentLocations.length > 0) {
            const patterns = buildLocationContext(frequentPlaces, recentLocations, totalCount);
            return formatLocationContextForAI(patterns);
          }
        } catch (err) { console.warn('Briefing: location fetch failed:', err instanceof Error ? err.message : err); }
        return undefined;
      };

      const fetchActiveGoals = async (): Promise<GoalContext[]> => {
        try {
          const goals = await storage.getActiveGoals(user.id);
          return goals.map(g => {
            const milestones = (Array.isArray(g.milestones) ? g.milestones : []) as MilestoneJSON[];
            const completedCount = milestones.filter(m => m.isCompleted).length;
            return {
              title: g.title,
              description: g.description,
              progressPercent: g.progressPercent,
              status: g.status,
              targetDate: g.targetDate ? g.targetDate.toISOString().split('T')[0] : null,
              milestonesSummary: milestones.length > 0 ? `${completedCount}/${milestones.length} completed` : undefined,
            };
          });
        } catch (err) { console.warn('Briefing: goals fetch failed:', err instanceof Error ? err.message : err); }
        return [];
      };
      
      const fetchActiveReminders = async (): Promise<Array<{ content: string; triggerType: string; triggerTime?: string; triggerLocationName?: string }>> => {
        try {
          const reminders = await storage.getReminders(user.id, 'pending');
          return reminders.map(r => ({
            content: r.content,
            triggerType: r.triggerType,
            triggerTime: r.triggerTime ? r.triggerTime.toISOString() : undefined,
            triggerLocationName: r.triggerLocationName || undefined,
          }));
        } catch (err) { console.warn('Briefing: reminders fetch failed:', err instanceof Error ? err.message : err); }
        return [];
      };
      
      const fetchRecentMessages = async (): Promise<string | undefined> => {
        try {
          const recentMsgs = await storage.getRecentMessages(user.id, 3, 100);
          if (recentMsgs.length === 0) return undefined;
          const processed = recentMsgs.filter(m => m.aiProcessed && m.body);
          if (processed.length === 0) return undefined;
          const convIds = Array.from(new Set(processed.map(m => m.conversationId)));
          const convNames = new Map<string, string>();
          for (const cid of convIds) {
            const conv = await storage.getMessageConversation(cid, user.id);
            if (conv) convNames.set(cid, conv.contactName || conv.contactAddress);
          }
          const grouped = new Map<string, typeof processed>();
          for (const msg of processed) {
            const existing = grouped.get(msg.conversationId) || [];
            existing.push(msg);
            grouped.set(msg.conversationId, existing);
          }
          const summaries: string[] = [];
          const entries = Array.from(grouped.entries());
          for (const [cid, msgs] of entries) {
            const contact = convNames.get(cid) || 'Unknown';
            const topMsgs = msgs.slice(0, 5);
            const lines = topMsgs.map(m => {
              const dir = m.direction === 'sent' ? 'User' : contact;
              return `  ${dir}: "${m.body}"`;
            }).join('\n');
            summaries.push(`Conversation with ${contact} (${msgs.length} messages, mood: ${msgs[0].mood || 'neutral'}):\n${lines}`);
          }
          return summaries.slice(0, 5).join('\n\n');
        } catch (err) { console.warn('Briefing: messages fetch failed:', err instanceof Error ? err.message : err); return undefined; }
      };

      const [emailResult, financialSummary, locationContext, activeGoals, activeReminders, messageContext] = await Promise.all([fetchEmails(), fetchFinancial(), fetchLocationContext(), fetchActiveGoals(), fetchActiveReminders(), fetchRecentMessages()]);
      const emailContext = emailResult.emails;
      const emailSource = emailResult.source;
      
      const briefingMemories = recentMemories.map(m => ({
        memoryText: m.memoryText!,
        mood: m.mood || undefined,
        moodScore: m.moodScore || undefined,
        timestamp: m.timestamp!,
        topicTag: m.topicTag!,
        detectedPeople: m.detectedPeople || undefined,
      }));

      if (messageContext) {
        briefingMemories.push({
          memoryText: `[TEXT MESSAGE SUMMARY]\n${messageContext}`,
          mood: undefined,
          moodScore: undefined,
          timestamp: new Date(),
          topicTag: 'Social',
          detectedPeople: undefined,
        });
      }

      const userTimezone = queryTimezone || userSettings?.userTimezone || 'America/Denver';
      
      const briefing = await generateMorningBriefing(
        briefingMemories,
        user.username,
        localHour,
        emailContext.length > 0 ? emailContext : undefined,
        activeProjects,
        financialSummary,
        knownPeople.length > 0 ? knownPeople : undefined,
        locationContext,
        activeGoals.length > 0 ? activeGoals : undefined,
        activeReminders.length > 0 ? activeReminders : undefined,
        userTimezone,
        userSettings?.sassLevel ?? 50,
        userSettings?.professionalMode ?? false
      );

      // Cache the result (30 minute TTL)
      const memoriesHash = recentMemories.map(m => m.id).join(',');
      await storage.setAiCache(user.id, 'briefing', cacheKey, briefing, memoriesHash, recentMemories.length, 30);

      // Send response immediately
      res.json({
        status: 'success',
        data: briefing,
        memoriesAnalyzed: recentMemories.length,
        emailsAnalyzed: emailContext.length,
        emailSource,
        hasFinancialData: !!financialSummary,
        cached: false,
        generatedAt: new Date().toISOString()
      });

      // Background: Send notifications
      const sendToTelegram = req.query.sendToTelegram === 'true';
      const sendPushNotif = req.query.sendPush === 'true';
      
      if (sendToTelegram || sendPushNotif) {
        setImmediate(async () => {
          try {
            // Telegram notification
            if (sendToTelegram && userSettings?.telegramEnabled && userSettings?.telegramBriefingsEnabled && userSettings?.telegramChatId) {
              const briefingText = formatBriefingForTelegram(briefing);
              await sendBriefingToTelegram(user.id, briefingText);
            }
            
            // Push notification
            if (sendPushNotif && isPushConfigured()) {
              const focusAreas = briefing.focusAreas?.slice(0, 2).join(' • ') || 'Your daily briefing is ready';
              await sendPushToAllUserDevices(user.id, {
                type: 'briefing',
                title: 'Good Morning ☀️',
                body: focusAreas.substring(0, 100),
                url: '/dashboard',
              });
            }
          } catch (err) {
            console.error('Background briefing notification error:', err);
          }
        });
      }
      
      return;
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to generate briefing", error);
    }
  });

  /**
   * GET /api/news-feed - Generate personalized news feed from user's Keryx ecosystem
   * 
   * Aggregates data from memories, calendars, emails, and financial accounts
   * to create news-style stories about the user's personal ecosystem.
   * Uses caching to avoid regenerating on every request (30-minute TTL).
   */
  app.get("/api/news-feed", requireAuth, requireTier('pro'), aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const forceRefresh = req.query.refresh === 'true';
      const userTimezone = typeof req.query.timezone === 'string' ? req.query.timezone : 'UTC';
      
      const nowForCache = new Date();
      const userLocalNow = new Date(nowForCache.toLocaleString('en-US', { timeZone: userTimezone }));
      const userLocalDate = `${userLocalNow.getFullYear()}-${String(userLocalNow.getMonth() + 1).padStart(2, '0')}-${String(userLocalNow.getDate()).padStart(2, '0')}`;
      const userLocalHour = userLocalNow.getHours();
      const cacheKey = `${userLocalDate}-h${userLocalHour}-${userTimezone}`;
      
      if (!forceRefresh) {
        const cached = await storage.getAiCache(user.id, 'newsfeed', cacheKey);
        if (cached) {
          const latestTimestamp = await storage.getLatestMemoryTimestamp(user.id);
          const cacheTime = new Date(cached.generatedAt).getTime();
          const latestTime = latestTimestamp?.getTime() || 0;
          
          if (latestTime <= cacheTime) {
            return res.json({
              status: 'success',
              data: cached.data,
              dataSources: (cached.data as PersonalNewsFeed).dataSources,
              cached: true,
              generatedAt: cached.generatedAt.toISOString()
            });
          }
        }
      }
      
      // OPTIMIZED: Fetch independent data sources in parallel (using lightweight query)
      const [recentMemories, userSettings, userPeople] = await Promise.all([
        storage.getRecentLogEntriesLight(user.id, 7, 100),
        storage.getSettings(user.id),
        storage.getPeople(user.id)
      ]);
      
      const knownPeople = userPeople.map(p => ({
        name: p.name,
        relationship: p.relationship,
        notes: p.notes,
      }));
      
      // OPTIMIZED: Fetch email, calendar, and financial in parallel
      const preferredEmailProvider = userSettings?.emailProvider;
      const shouldFetchFinancial = isPlaidFeatureEnabled() && userSettings?.plaidEnabled && userSettings?.plaidIncludeInBriefings;
      
      const fetchEmails = async (): Promise<Array<{ subject: string; from: string; snippet: string; date: Date }>> => {
        try {
          if (!preferredEmailProvider || preferredEmailProvider === 'gmail') {
            const gmailConnected = await isGmailConnected();
            if (gmailConnected) {
              const emails = await getRecentEmails(10);
              const mapped = emails.map((e: { subject: string; from: string; snippet: string; date: Date }) => ({
                subject: e.subject, from: e.from, snippet: e.snippet, date: e.date
              }));
              if (mapped.length > 0) return mapped;
            }
          }
          if (!preferredEmailProvider || preferredEmailProvider === 'outlook') {
            const outlookConnected = await isOutlookMailConnected();
            if (outlookConnected) {

              const emails = await getOutlookRecentEmails(10);
              return emails.map((e: { subject: string; from: string; snippet: string; date: Date }) => ({
                subject: e.subject, from: e.from, snippet: e.snippet, date: e.date
              }));
            }
          }
        } catch (err) { console.warn('News-feed: email fetch failed:', err instanceof Error ? err.message : err); }
        return [];
      };
      
      const fetchCalendar = async (): Promise<Array<{ title: string; startTime: Date; endTime: Date; attendees?: string[]; location?: string }>> => {
        try {
          const calendarConnected = await isCalendarConnected();
          if (calendarConnected) {
            const events = await getUpcomingEvents(3);
            const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
            return events
              .filter(e => new Date(e.startTime) >= cutoff)
              .map(e => ({
                title: e.title, startTime: e.startTime, endTime: e.endTime, attendees: e.attendees, location: e.location
              }));
          }
        } catch (err) { console.warn('News-feed: calendar fetch failed:', err instanceof Error ? err.message : err); }
        return [];
      };
      
      const fetchFinancial = async (): Promise<{ totalSpending: number; transactionCount: number; categoryBreakdown: Array<{ category: string; amount: number }>; topMerchants: Array<{ merchant: string; amount: number }> } | undefined> => {
        if (!shouldFetchFinancial) return undefined;
        try {
          const rawSummary = await plaidService.getSpendingSummary(user.id, 7);
          if (rawSummary && rawSummary.transactionCount > 0) {
            return {
              totalSpending: rawSummary.totalSpending,
              transactionCount: rawSummary.transactionCount,
              categoryBreakdown: rawSummary.categoryBreakdown,
              topMerchants: rawSummary.topMerchants
            };
          }
        } catch (err) { console.warn('News-feed: financial fetch failed:', err instanceof Error ? err.message : err); }
        return undefined;
      };
      
      const fetchLocationContext = async (): Promise<string | undefined> => {
        try {

          const [frequentPlaces, recentLocations, totalCount] = await Promise.all([
            storage.getFrequentPlaces(user.id),
            storage.getRecentLocations(user.id, 7, 50),
            storage.getLocationHistoryCount(user.id)
          ]);
          if (frequentPlaces.length > 0 || recentLocations.length > 0) {
            const patterns = buildLocationContext(frequentPlaces, recentLocations, totalCount);
            return formatLocationContextForAI(patterns);
          }
        } catch (err) { console.warn('News-feed: location fetch failed:', err instanceof Error ? err.message : err); }
        return undefined;
      };
      
      const fetchGoals = async () => {
        try {
          const goals = await storage.getGoals(user.id);
          return goals.filter(g => g.status === 'active').map(g => ({
            title: g.title,
            description: g.description,
            progressPercent: g.progressPercent,
            targetDate: g.targetDate?.toISOString() || null,
            status: g.status,
          }));
        } catch (err) { console.warn('News-feed: goals fetch failed:', err instanceof Error ? err.message : err); return []; }
      };

      const fetchRecentMessages = async (): Promise<string | undefined> => {
        try {
          const recentMsgs = await storage.getRecentMessages(user.id, 7, 100);
          const processed = recentMsgs.filter(m => m.aiProcessed && m.body);
          if (processed.length === 0) return undefined;
          const convIds = Array.from(new Set(processed.map(m => m.conversationId)));
          const convNames = new Map<string, string>();
          for (const cid of convIds) {
            const conv = await storage.getMessageConversation(cid, user.id);
            if (conv) convNames.set(cid, conv.contactName || conv.contactAddress);
          }
          const grouped = new Map<string, typeof processed>();
          for (const msg of processed) {
            const existing = grouped.get(msg.conversationId) || [];
            existing.push(msg);
            grouped.set(msg.conversationId, existing);
          }
          const summaries: string[] = [];
          const entries = Array.from(grouped.entries());
          for (const [cid, msgs] of entries) {
            const contact = convNames.get(cid) || 'Unknown';
            const topMsgs = msgs.slice(0, 5);
            const lines = topMsgs.map(m => {
              const dir = m.direction === 'sent' ? 'User' : contact;
              return `  ${dir}: "${m.body}"`;
            }).join('\n');
            summaries.push(`Conversation with ${contact} (${msgs.length} messages, mood: ${msgs[0].mood || 'neutral'}):\n${lines}`);
          }
          return summaries.slice(0, 5).join('\n\n');
        } catch (err) { console.warn('News-feed: messages fetch failed:', err instanceof Error ? err.message : err); return undefined; }
      };

      const [emailContext, calendarEvents, financialSummary, locationContext, activeGoals, messageContext] = await Promise.all([
        fetchEmails(), fetchCalendar(), fetchFinancial(), fetchLocationContext(), fetchGoals(), fetchRecentMessages()
      ]);
      
      const insightMemories = recentMemories.map(m => ({
          memoryText: m.memoryText!,
          mood: m.mood || undefined,
          moodScore: m.moodScore || undefined,
          timestamp: m.timestamp!,
          topicTag: m.topicTag!,
          detectedPeople: m.detectedPeople || undefined,
      }));

      if (messageContext) {
        insightMemories.push({
          memoryText: `[TEXT MESSAGE SUMMARY]\n${messageContext}`,
          mood: undefined,
          moodScore: undefined,
          timestamp: new Date(),
          topicTag: 'Social',
          detectedPeople: undefined,
        });
      }

      const newsFeed = await generatePersonalNewsFeed(
        insightMemories,
        calendarEvents.length > 0 ? calendarEvents : undefined,
        emailContext.length > 0 ? emailContext : undefined,
        financialSummary,
        user.username,
        userTimezone,
        knownPeople.length > 0 ? knownPeople : undefined,
        locationContext,
        activeGoals.length > 0 ? activeGoals : undefined,
        userSettings?.sassLevel ?? 50,
        userSettings?.professionalMode ?? false
      );

      const memoriesHash = recentMemories.map(m => m.id).join(',');
      await storage.setAiCache(user.id, 'newsfeed', cacheKey, newsFeed, memoriesHash, recentMemories.length, 30);

      const dataSourceStatus = {
        memories: { checked: true, count: recentMemories.length },
        calendar: { checked: true, count: calendarEvents.length },
        email: { checked: true, count: emailContext.length },
        financial: { checked: shouldFetchFinancial === true, available: !!financialSummary },
        location: { checked: true, available: !!locationContext },
        goals: { checked: true, count: activeGoals.length },
        messages: { checked: true, available: !!messageContext },
      };

      res.json({
        status: 'success',
        data: newsFeed,
        dataSources: newsFeed.dataSources,
        dataSourceStatus,
        cached: false,
        generatedAt: newsFeed.generatedAt.toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to generate news feed", error);
    }
  });

  /**
   * GET /api/discoveries - Get contextual discoveries based on user's insights
   * 
   * Analyzes user's ecosystem (memories, calendar, emails, finances) to extract
   * actionable insights, then uses Tavily AI Search to find relevant, ad-free content.
   * Examples: travel tips for upcoming trips, local news for destinations, product reviews.
   * Requires TAVILY_API_KEY to be configured.
   */
  app.get("/api/discoveries", requireAuth, requireTier('life_os'), aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const tavilyApiKey = process.env.TAVILY_API_KEY;
      
      if (!tavilyApiKey) {
        return res.json({
          status: 'success',
          data: {
            discoveries: [],
            insights: [],
            generatedAt: new Date().toISOString()
          },
          configured: false,
          message: 'Tavily API not configured. Add TAVILY_API_KEY to enable contextual discoveries.'
        });
      }
      
      // Check cache first
      const forceRefresh = req.query.refresh === 'true';
      const cacheKey = 'discoveries';
      
      if (!forceRefresh) {
        const cached = await storage.getAiCache(user.id, 'discoveries', cacheKey);
        if (cached) {
          return res.json({
            status: 'success',
            data: cached.data,
            configured: true,
            cached: true
          });
        }
      }
      
      // Get recent memories (only last 7 days for discoveries - more relevant)
      // Use light version to avoid fetching large embedding vectors
      const recentMemories = await storage.getRecentLogEntriesLight(user.id, 7, 30);
      
      // Get calendar events (next 14 days for travel/event insights)
      let calendarEvents: Array<{ summary?: string; location?: string; start?: { dateTime?: string; date?: string } }> = [];
      try {
        const calendarConnected = await isCalendarConnected();
        if (calendarConnected) {
          const events = await getUpcomingEvents(14);
          calendarEvents = events.map(e => ({
            summary: e.title,
            location: e.location,
            start: { dateTime: e.startTime?.toISOString() }
          }));
        }
      } catch (calendarError) {
        console.warn('Discoveries: calendar fetch failed:', calendarError instanceof Error ? calendarError.message : calendarError);
      }
      
      let emails: Array<{ subject?: string; snippet?: string; from?: string }> = [];
      try {
        const gmailConnected = await isGmailConnected();
        if (gmailConnected) {
          const capabilities = await getGmailCapabilities();
          if (capabilities.canRead) {
            const recentEmails = await getRecentEmails(10);
            emails = recentEmails.map(e => ({
              subject: e.subject,
              snippet: e.snippet,
              from: e.from
            }));
          }
        }
      } catch (emailError) {
        console.warn('Discoveries: email fetch failed:', emailError instanceof Error ? emailError.message : emailError);
      }
      
      // Get financial data with transaction details
      const userSettings = await storage.getSettings(user.id);
      let financialData: { merchants?: string[]; categories?: string[]; merchantAggregates?: Array<{ name: string; amount: number; category?: string }> } | undefined;
      if (isPlaidFeatureEnabled() && userSettings?.plaidEnabled) {
        try {
          const rawSummary = await plaidService.getSpendingSummary(user.id, 30);
          if (rawSummary && rawSummary.transactionCount > 0) {
            financialData = {
              merchants: rawSummary.topMerchants.map(m => m.merchant),
              categories: rawSummary.categoryBreakdown.map(c => c.category),
              merchantAggregates: rawSummary.topMerchants.slice(0, 10).map(m => ({
                name: m.merchant,
                amount: m.amount,
                category: rawSummary.categoryBreakdown.find(c => c.category)?.category
              }))
            };
          }
        } catch (finError) {
          console.warn('Discoveries: financial fetch failed:', finError instanceof Error ? finError.message : finError);
        }
      }
      
      let locationContext: { currentCity?: string; homeCity?: string; isAway?: boolean } | undefined;
      try {
        const frequentPlaces = await storage.getFrequentPlaces(user.id);
        const homePlace = frequentPlaces.find(p => p.label === 'home');
        
        // Always seed homeCity so memory-based local searches (food, services) are
        // localized even when the user is at home, not just when traveling.
        if (homePlace?.name) {
          locationContext = { homeCity: homePlace.name, isAway: false };
        }

        // Get most recent memory location to determine if user is currently away
        const latestMemoryWithLocation = recentMemories.find(m => m.geoPlaceName);
        if (latestMemoryWithLocation?.geoPlaceName && homePlace?.name) {
          const currentLocation = latestMemoryWithLocation.geoPlaceName;
          const homeLocation = homePlace.name;
          
          // Simple check if user seems to be in a different city
          const isAway = !currentLocation.toLowerCase().includes(homeLocation.split(',')[0].toLowerCase());
          
          if (isAway) {
            locationContext = {
              currentCity: currentLocation,
              homeCity: homeLocation,
              isAway: true
            };
          }
        }
      } catch (locError) {
        console.warn('Discoveries: location fetch failed:', locError instanceof Error ? locError.message : locError);
      }
      
      let activeGoals: Array<{ title: string; description: string | null; progressPercent: number; status: string }> = [];
      try {
        const goals = await storage.getGoals(user.id);
        activeGoals = goals.filter(g => g.status === 'active').map(g => ({
          title: g.title,
          description: g.description,
          progressPercent: g.progressPercent,
          status: g.status,
        }));
      } catch (err) { console.warn('Discoveries: goals fetch failed:', err instanceof Error ? err.message : err); }
      
      const discoveries = await getContextualDiscoveries(
        recentMemories
          .filter(m => m.memoryText && m.timestamp && m.topicTag)
          .map((m) => ({
            memoryText: m.memoryText!,
            topicTag: m.topicTag!,
            detectedPeople: m.detectedPeople || [],
            locationName: m.geoPlaceName || undefined,
            timestamp: m.timestamp!
          })),
        calendarEvents,
        emails,
        financialData,
        tavilyApiKey,
        locationContext,
        activeGoals.length > 0 ? activeGoals : undefined
      );
      
      // Check for high-signal mentions of VIP people
      let highSignalAlerts: HighSignalMatch[] = [];
      if (discoveries.discoveries.length > 0) {
        try {
          const highSignalResult = await detectHighSignalMentions(user.id, discoveries.discoveries);
          const alertableMatches = shouldTriggerAlert(highSignalResult.matches);
          
          if (alertableMatches.length > 0) {
            highSignalAlerts = alertableMatches;
          }
        } catch (hsError) {
          console.error('High-signal detection failed:', hsError);
        }
      }
      
      // Cache the result for 240 minutes (limits Tavily calls to ~6/day)
      await storage.setAiCache(user.id, 'discoveries', cacheKey, {
        discoveries: discoveries.discoveries,
        insights: discoveries.insights,
        generatedAt: discoveries.generatedAt,
        highSignalAlerts: highSignalAlerts.map(m => ({
          personName: m.person.name,
          personPriority: m.person.priority,
          discoveryTitle: m.discovery.title,
          matchContext: m.matchContext,
          confidence: m.confidence
        }))
      }, '', recentMemories.length, 240);
      
      res.json({
        status: 'success',
        data: {
          discoveries: discoveries.discoveries,
          insights: discoveries.insights,
          generatedAt: discoveries.generatedAt,
          highSignalAlerts: highSignalAlerts.map(m => ({
            personId: m.person.id,
            personName: m.person.name,
            personPriority: m.person.priority,
            relationship: m.person.relationship,
            discoveryId: m.discovery.id,
            discoveryTitle: m.discovery.title,
            discoveryUrl: m.discovery.url,
            matchContext: m.matchContext,
            confidence: m.confidence
          }))
        },
        configured: true,
        error: discoveries.error
      });

      // Background: Send push notification for high-signal alerts
      if (highSignalAlerts.length > 0 && isPushConfigured()) {
        setImmediate(async () => {
          try {
            const topAlert = highSignalAlerts[0];
            const alertMessage = formatHighSignalAlert(topAlert);
            await sendPushToAllUserDevices(user.id, {
              type: 'discovery',
              title: `🚨 ${topAlert.person.name} mentioned`,
              body: alertMessage.body.substring(0, 120),
              url: '/dashboard',
              requireInteraction: topAlert.person.priority >= 9,
            });
          } catch (err) {
            console.error('High-signal push notification error:', err);
          }
        });
      }
      
      return;
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch contextual discoveries", error);
    }
  });

  /**
   * GET /api/alerts - Get pattern alerts for the user
   * 
   * Analyzes recent memories to detect significant patterns
   * and returns actionable alerts.
   * Uses caching to avoid regenerating on every request (30-minute TTL).
   */
  app.get("/api/alerts", requireAuth, requireTier('pro'), aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const days = parseInt(req.query.days as string) || 14;
      const forceRefresh = req.query.refresh === 'true';
      
      // Cache key based on days parameter
      const cacheKey = `days-${days}`;
      
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = await storage.getAiCache(user.id, 'alerts', cacheKey);
        if (cached) {
          // Check if memory count has changed
          const latestTimestamp = await storage.getLatestMemoryTimestamp(user.id);
          const cacheTime = new Date(cached.generatedAt).getTime();
          const latestTime = latestTimestamp?.getTime() || 0;
          
          // Return cached if no new memories since cache was generated
          if (latestTime <= cacheTime) {
            return res.json({
              status: 'success',
              data: cached.data,
              memoriesAnalyzed: cached.memoriesCount,
              periodDays: days,
              telegramSent: false,
              cached: true,
              timestamp: cached.generatedAt.toISOString()
            });
          }
        }
      }
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const [recentMemories, recentMsgs] = await Promise.all([
        storage.getRecentLogEntriesLight(user.id, days, 100),
        storage.getRecentMessages(user.id, days, 100),
      ]);

      const alertMemories = recentMemories
          .filter(m => m.memoryText && m.timestamp && m.topicTag)
          .map((m) => ({
            memoryText: m.memoryText!,
            mood: m.mood || undefined,
            moodScore: m.moodScore || undefined,
            timestamp: m.timestamp!,
            topicTag: m.topicTag!,
          }));

      const processedMsgs = recentMsgs.filter(m => m.aiProcessed && m.body);
      if (processedMsgs.length > 0) {
        const convIds = Array.from(new Set(processedMsgs.map(m => m.conversationId)));
        const convNames = new Map<string, string>();
        for (const cid of convIds) {
          try {
            const conv = await storage.getMessageConversation(cid, user.id);
            if (conv) convNames.set(cid, conv.contactName || conv.contactAddress);
          } catch (err) { console.warn('Alerts: conversation lookup failed:', err instanceof Error ? err.message : err); }
        }
        const grouped = new Map<string, typeof processedMsgs>();
        for (const msg of processedMsgs) {
          const existing = grouped.get(msg.conversationId) || [];
          existing.push(msg);
          grouped.set(msg.conversationId, existing);
        }
        const gEntries = Array.from(grouped.entries());
        for (const [cid, msgs] of gEntries.slice(0, 5)) {
          const contact = convNames.get(cid) || 'Unknown';
          const topMsgs = msgs.slice(0, 3);
          const lines = topMsgs.map(m => {
            const dir = m.direction === 'sent' ? 'User' : contact;
            return `${dir}: "${m.body}"`;
          }).join('\n');
          alertMemories.push({
            memoryText: `[Text conversation with ${contact}]\n${lines}`,
            mood: msgs[0].mood || undefined,
            moodScore: msgs[0].moodScore || undefined,
            timestamp: msgs[0].timestamp,
            topicTag: msgs[0].topicTag || 'Social',
          });
        }
      }
      
      // Get user timezone from query param or settings
      const queryTimezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;
      const userSettings = await storage.getSettings(user.id);
      const userTimezone = queryTimezone || userSettings?.userTimezone || 'America/Denver';
      
      const alerts = await detectPatternAlerts(alertMemories, userTimezone, userSettings?.sassLevel ?? 50, userSettings?.professionalMode ?? false);

      // Cache the result (30 minute TTL)
      const memoriesHash = recentMemories.filter(m => m.id).map(m => m.id).join(',');
      await storage.setAiCache(user.id, 'alerts', cacheKey, alerts, memoriesHash, recentMemories.length, 30);

      // Optionally send alerts to Telegram
      const sendToTelegram = req.query.sendToTelegram === 'true';
      let telegramSent = false;
      let pushSent = 0;
      
      // Send notifications in background after response
      res.json({
        status: 'success',
        data: alerts,
        memoriesAnalyzed: recentMemories.length,
        periodDays: days,
        cached: false,
        timestamp: new Date().toISOString()
      });

      // Background: Send notifications for alerts
      if (sendToTelegram && alerts.length > 0) {
        setImmediate(async () => {
          try {
            const userSettings = await storage.getSettings(user.id);
            
            // Telegram notification
            if (userSettings?.telegramEnabled && userSettings?.telegramAlertsEnabled && userSettings?.telegramChatId) {
              const alertsText = formatAlertsForTelegram(alerts);
              await sendAlertToTelegram(user.id, alertsText);
            }
            
            // Push notification for most important alert
            if (isPushConfigured()) {
              const topAlert = alerts[0];
              if (topAlert) {
                const result = await sendPushToAllUserDevices(user.id, {
                  type: 'alert',
                  title: `Pattern Alert: ${topAlert.type}`,
                  body: topAlert.description.substring(0, 120) + (topAlert.description.length > 120 ? '...' : ''),
                  url: '/dashboard',
                });
                pushSent = result.sent;
              }
            }
          } catch (err) {
            console.error('Background notification error:', err);
          }
        });
      }
      
      return;
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to detect patterns", error);
    }
  });

  /**
   * POST /api/backfill - Start background re-analysis of memories
   * 
   * Re-processes all memories to extract mood, moodScore, detectedPeople,
   * and link to calendar events. Runs in background and returns immediately.
   */
  app.post("/api/backfill", requireAuth, backfillLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const validation = backfillSchema.safeParse(req.body || {});
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      
      // Check if job already running for this user
      const existingJob = backfillJobs.get(user.id);
      if (existingJob && existingJob.status === 'running') {
        return res.json({
          status: 'already_running',
          message: 'Re-analysis is already in progress',
          job: existingJob,
          timestamp: new Date().toISOString()
        });
      }
      
      const { force: forceAll, includeCalendar, includeEmbeddings } = validation.data;
      
      // Get entries and set up job tracking
      const entries = await storage.getLogEntries(user.id, 500);
      const entriesNeedingBackfill = forceAll ? entries : entries.filter((e: any) => {
        const hasMood = e.mood && e.mood.trim() !== '';
        const hasPeople = Array.isArray(e.detectedPeople) && e.detectedPeople.length > 0;
        const hasCalendar = e.calendarEventId && e.calendarEventId.trim() !== '';
        const hasAiReasoning = e.aiReasoning && Object.keys(e.aiReasoning).length > 0;
        const hasEmbedding = Array.isArray(e.embeddingVector) && e.embeddingVector.length > 0 && !e.embeddingVector.every((v: number) => v === 0);
        return !hasMood || !hasPeople || !hasAiReasoning || (includeCalendar && !hasCalendar) || (includeEmbeddings && !hasEmbedding);
      });
      
      // Initialize job tracking
      const job: BackfillJob = {
        status: 'running',
        progress: 0,
        total: entriesNeedingBackfill.length,
        processed: 0,
        calendarLinked: 0,
        embeddingsGenerated: 0,
        errors: 0,
        startedAt: new Date(),
        message: `Processing 0 of ${entriesNeedingBackfill.length} memories...`
      };
      backfillJobs.set(user.id, job);
      
      // Return immediately, processing continues in background
      res.json({
        status: 'started',
        message: `Re-analysis started for ${entriesNeedingBackfill.length} memories`,
        totalEntries: entries.length,
        toProcess: entriesNeedingBackfill.length,
        timestamp: new Date().toISOString()
      });
      
      // Run processing in background (don't await)
      (async () => {
        try {
          const calendarConnected = includeCalendar ? await isCalendarConnected() : false;
          
          for (let i = 0; i < entriesNeedingBackfill.length; i++) {
            const entry = entriesNeedingBackfill[i];
            try {
              const metadata = await extractMetadata(entry.memoryText, typeof req.query.timezone === 'string' ? req.query.timezone : undefined);
              
              // Build update data with AI reasoning - include topicTag and importance for full re-analysis
              const updateData: any = {
                topicTag: metadata.topicTag,
                mood: metadata.mood,
                moodScore: metadata.moodScore,
                detectedPeople: metadata.detectedPeople,
                importance: metadata.importance,
              };
              
              // Create category if it doesn't exist
              if (metadata.topicTag) {
                await storage.createCategoryIfNotExists(user.id, metadata.topicTag);
              }
              
              // Include AI reasoning for transparency
              let calendarReasoning: string | undefined;
              
              // Calendar linking if enabled and not already linked
              if (calendarConnected && !entry.calendarEventId && entry.timestamp) {
                try {
                  const relevantEvent = await findRelevantEvent(entry.timestamp);
                  if (relevantEvent) {
                    updateData.calendarEventId = relevantEvent.id;
                    updateData.calendarEventTitle = relevantEvent.title;
                    updateData.calendarEventAttendees = relevantEvent.attendees || [];
                    calendarReasoning = `Memory linked to "${relevantEvent.title}" event (recorded during event timeframe)`;
                    job.calendarLinked++;
                  }
                } catch (calErr) {
                  console.warn(`Calendar lookup failed for entry ${entry.id}:`, calErr);
                }
              }
              
              // Combine AI reasoning with calendar reasoning
              if (metadata.aiReasoning || calendarReasoning) {
                updateData.aiReasoning = {
                  ...(metadata.aiReasoning || {}),
                  ...(calendarReasoning ? { calendar: calendarReasoning } : {}),
                };
              }
              
              // Regenerate embedding if requested and missing/zero
              if (includeEmbeddings) {
                const hasValidEmbedding = Array.isArray(entry.embeddingVector) && 
                  entry.embeddingVector.length > 0 && 
                  !entry.embeddingVector.every((v: number) => v === 0);
                  
                if (!hasValidEmbedding) {
                  try {
                    const newEmbedding = await generateEmbedding(entry.memoryText);
                    if (!newEmbedding.every(v => v === 0)) {
                      updateData.embeddingVector = newEmbedding;
                      job.embeddingsGenerated++;
                    }
                  } catch (embErr) {
                    console.warn(`Embedding generation failed for entry ${entry.id}:`, embErr);
                  }
                }
              }
              
              await storage.updateLogEntry(entry.id, user.id, updateData);
              
              if (metadata.detectedPeople && metadata.detectedPeople.length > 0) {
                for (const personName of metadata.detectedPeople) {
                  await storage.upsertPerson(user.id, personName);
                }
              }
              
              job.processed++;
            } catch (err) {
              console.error(`Failed to backfill entry ${entry.id}:`, err);
              job.errors++;
            }
            
            // Update progress
            job.progress = Math.round(((i + 1) / entriesNeedingBackfill.length) * 100);
            job.message = `Processing ${i + 1} of ${entriesNeedingBackfill.length} memories...`;
          }
          
          // Mark complete with detailed summary
          job.status = 'completed';
          job.completedAt = new Date();
          const summaryParts = [`Analyzed ${job.processed} memories`];
          if (job.calendarLinked > 0) summaryParts.push(`linked ${job.calendarLinked} to calendar`);
          if (job.embeddingsGenerated > 0) summaryParts.push(`regenerated ${job.embeddingsGenerated} embeddings`);
          job.message = `Completed! ${summaryParts.join(', ')}.`;
          
        } catch (error) {
          console.error("Background backfill failed:", error);
          job.status = 'failed';
          job.completedAt = new Date();
          job.message = 'Analysis failed. Please try again.';
        }
      })();
      
    } catch (error) {
      console.error("Failed to start backfill:", error);
      sendErrorResponse(res, 500, "Failed to start re-analysis", error);
    }
  });

  /**
   * GET /api/backfill/status - Check background re-analysis progress
   */
  app.get("/api/backfill/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const job = backfillJobs.get(user.id);
      
      if (!job) {
        return res.json({
          status: 'idle',
          message: 'No active re-analysis job',
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        status: job.status,
        progress: job.progress,
        total: job.total,
        processed: job.processed,
        calendarLinked: job.calendarLinked,
        embeddingsGenerated: job.embeddingsGenerated,
        errors: job.errors,
        message: job.message,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get status", error);
    }
  });

  /**
   * DELETE /api/backfill/status - Clear completed job status
   */
  app.delete("/api/backfill/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const job = backfillJobs.get(user.id);
      
      if (job && job.status !== 'running') {
        backfillJobs.delete(user.id);
      }
      
      res.json({
        status: 'cleared',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to clear status", error);
    }
  });

  // =========================================
  // AI ACTIONS API ENDPOINTS
  // =========================================

  /**
   * GET /api/actions - Get user's AI actions with optional status filter
   */
  app.get("/api/actions", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const statusFilter = req.query.status 
        ? (req.query.status as string).split(',') 
        : undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const actions = await storage.getAiActions(user.id, statusFilter, limit);
      
      res.json({
        status: 'success',
        data: actions,
        count: actions.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch actions", error);
    }
  });

  /**
   * GET /api/actions/pending - Get pending actions awaiting approval
   */
  app.get("/api/actions/pending", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const pendingActions = await storage.getPendingActions(user.id);
      
      res.json({
        status: 'success',
        data: pendingActions,
        count: pendingActions.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch pending actions", error);
    }
  });

  /**
   * GET /api/actions/available - Get available action types with connection status
   */
  app.get("/api/actions/available", requireAuth, async (req, res) => {
    try {
      const actionTypes = await getAvailableActionTypes();
      
      res.json({
        status: 'success',
        data: actionTypes,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch available actions", error);
    }
  });

  /**
   * GET /api/actions/preferences - Get user's action preferences
   * NOTE: Must be defined BEFORE /api/actions/:id to prevent route conflicts
   */
  app.get("/api/actions/preferences", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const preferences = await storage.getAiActionPreferences(user.id);
      
      res.json({
        status: 'success',
        data: preferences,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch preferences", error);
    }
  });

  /**
   * PUT /api/actions/preferences/:actionType - Update preference for an action type
   * NOTE: Must be defined BEFORE /api/actions/:id to prevent route conflicts
   */
  app.put("/api/actions/preferences/:actionType", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { actionType } = req.params;
      const { policy, conditions } = req.body;
      
      if (!policy || !['auto', 'confirm', 'disabled'].includes(policy)) {
        return sendErrorResponse(res, 400, "Invalid policy. Must be 'auto', 'confirm', or 'disabled'");
      }
      
      const preference = await storage.upsertAiActionPreference(
        user.id, 
        actionType, 
        policy, 
        conditions
      );
      
      res.json({
        status: 'success',
        data: preference,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update preference", error);
    }
  });

  /**
   * GET /api/actions/:id - Get a specific action
   */
  app.get("/api/actions/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const action = await storage.getAiAction(req.params.id, user.id);
      
      if (!action) {
        return sendErrorResponse(res, 404, "Action not found");
      }
      
      res.json({
        status: 'success',
        data: action,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch action", error);
    }
  });

  /**
   * POST /api/actions/:id/approve - Approve and execute a pending action
   */
  app.post("/api/actions/:id/approve", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      
      const result = await approveAction(req.params.id, user.id);
      
      if (!result.success) {
        return res.status(400).json({
          status: 'error',
          message: result.errorMessage,
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        status: 'success',
        message: 'Action executed successfully',
        data: result.resultData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to approve action", error);
    }
  });

  /**
   * POST /api/actions/:id/reject - Reject a pending action
   */
  app.post("/api/actions/:id/reject", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      const success = await rejectAction(req.params.id, user.id);
      
      if (!success) {
        return sendErrorResponse(res, 400, "Failed to reject action");
      }
      
      res.json({
        status: 'success',
        message: 'Action rejected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to reject action", error);
    }
  });

  /**
   * POST /api/actions/resolve-by-source - Resolve pending actions for a specific memory
   * Used when an action is handled inline (e.g., calendar event created from Log screen)
   */
  app.post("/api/actions/resolve-by-source", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { sourceId, actionType, resolution } = req.body;
      
      if (!sourceId || typeof sourceId !== 'string') {
        return sendErrorResponse(res, 400, "sourceId is required");
      }
      
      const validResolutions = ['completed', 'rejected'] as const;
      const resolvedStatus = validResolutions.includes(resolution) ? resolution : 'completed';
      
      const resolved = await storage.resolvePendingActionsBySource(user.id, sourceId, actionType, resolvedStatus);
      
      res.json({
        status: 'success',
        resolved,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to resolve actions", error);
    }
  });

  /**
   * POST /api/actions/detect - Detect actions from user input (for testing)
   */
  app.post("/api/actions/detect", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const { userInput, timezone } = req.body;
      
      if (!userInput || typeof userInput !== 'string') {
        return sendErrorResponse(res, 400, "userInput is required");
      }
      
      const result = await processUserInputForActions(user.id, userInput, 'manual', undefined, { timezone });
      
      res.json({
        status: 'success',
        actionDetected: result.actionDetected,
        action: result.action,
        autoExecuted: result.autoExecuted,
        executionResult: result.executionResult,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to detect actions", error);
    }
  });

  // =========================================
  // TELEGRAM INTEGRATION API ENDPOINTS
  // =========================================

  /**
   * GET /api/telegram/status - Check Telegram connection status
   */
  app.get("/api/telegram/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const userSettings = await storage.getSettings(user.id);
      
      res.json({
        status: 'success',
        data: {
          configured: isTelegramConfigured(),
          connected: !!userSettings?.telegramChatId,
          enabled: userSettings?.telegramEnabled ?? false,
          briefingsEnabled: userSettings?.telegramBriefingsEnabled ?? true,
          alertsEnabled: userSettings?.telegramAlertsEnabled ?? true,
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to check Telegram status", error);
    }
  });

  /**
   * POST /api/telegram/connect - Generate verification code for Telegram connection
   */
  app.post("/api/telegram/connect", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      if (!isTelegramConfigured()) {
        return sendErrorResponse(res, 503, "Telegram is not configured on this server");
      }
      
      const verificationCode = await generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      await storage.updateSettings(user.id, {
        telegramVerificationCode: verificationCode,
        telegramVerificationExpires: expiresAt,
      });
      
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'KeryxMemoryBot';
      
      res.json({
        status: 'success',
        data: {
          verificationCode,
          expiresAt: expiresAt.toISOString(),
          telegramLink: `https://t.me/${botUsername}?start=${verificationCode}`,
          botUsername,
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to generate verification code", error);
    }
  });

  /**
   * DELETE /api/telegram/disconnect - Disconnect Telegram account
   */
  app.delete("/api/telegram/disconnect", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      await storage.updateSettings(user.id, {
        telegramChatId: null,
        telegramEnabled: false,
        telegramVerificationCode: null,
        telegramVerificationExpires: null,
      });
      
      res.json({
        status: 'success',
        message: 'Telegram disconnected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to disconnect Telegram", error);
    }
  });

  /**
   * PUT /api/telegram/settings - Update Telegram notification settings
   */
  app.put("/api/telegram/settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { enabled, briefingsEnabled, alertsEnabled } = req.body;
      
      const updates: Record<string, any> = {};
      if (enabled !== undefined) updates.telegramEnabled = enabled;
      if (briefingsEnabled !== undefined) updates.telegramBriefingsEnabled = briefingsEnabled;
      if (alertsEnabled !== undefined) updates.telegramAlertsEnabled = alertsEnabled;
      
      const updatedSettings = await storage.updateSettings(user.id, updates);
      
      res.json({
        status: 'success',
        data: {
          enabled: updatedSettings.telegramEnabled,
          briefingsEnabled: updatedSettings.telegramBriefingsEnabled,
          alertsEnabled: updatedSettings.telegramAlertsEnabled,
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update Telegram settings", error);
    }
  });

  /**
   * POST /api/telegram/test - Send a test message to Telegram
   */
  app.post("/api/telegram/test", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const userSettings = await storage.getSettings(user.id);
      
      if (!userSettings?.telegramChatId) {
        return sendErrorResponse(res, 400, "Telegram is not connected");
      }
      
      const success = await sendTelegramMessage(
        userSettings.telegramChatId,
        '🎉 <b>Test message from Keryx!</b>\n\nYour Telegram integration is working correctly.'
      );
      
      if (!success) {
        return sendErrorResponse(res, 500, "Failed to send test message");
      }
      
      res.json({
        status: 'success',
        message: 'Test message sent',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to send test message", error);
    }
  });

  /**
   * POST /api/telegram/webhook - Webhook endpoint for Telegram bot updates
   * This is called by Telegram when the bot receives messages
   * Validates X-Telegram-Bot-Api-Secret-Token header for security
   */
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      // Validate webhook secret if configured
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (webhookSecret) {
        const providedSecret = req.headers['x-telegram-bot-api-secret-token'];
        if (providedSecret !== webhookSecret) {
          // Return 200 to prevent retry but log unauthorized attempt
          console.warn('Unauthorized Telegram webhook attempt');
          return res.status(200).json({ ok: false });
        }
      }

      const update = req.body as TelegramUpdate;
      const result = await handleTelegramWebhook(update);
      
      // Telegram requires 200 response within 60 seconds
      res.status(200).json({ ok: true, result: result.response });
    } catch (error) {
      console.error('Telegram webhook error:', error);
      // Still return 200 to prevent Telegram from retrying
      res.status(200).json({ ok: false, error: 'Internal error' });
    }
  });

  /**
   * POST /api/telegram/setup-webhook - Set up the Telegram webhook (admin endpoint)
   */
  app.post("/api/telegram/setup-webhook", requireAuth, async (req, res) => {
    try {
      const { webhookUrl } = req.body;
      
      if (!webhookUrl) {
        return sendErrorResponse(res, 400, "webhookUrl is required");
      }
      
      const success = await setWebhook(webhookUrl);
      
      if (!success) {
        return sendErrorResponse(res, 500, "Failed to set webhook");
      }
      
      res.json({
        status: 'success',
        message: 'Webhook set successfully',
        webhookUrl,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to set webhook", error);
    }
  });

  // ============================================================================
  // Plaid / Financial Integration Routes
  // ============================================================================

  /**
   * GET /api/plaid/status - Check if Plaid is configured
   */
  app.get("/api/plaid/status", requireAuth, async (req, res) => {
    // Check if feature is enabled
    if (!isPlaidFeatureEnabled()) {
      return res.json({
        configured: false,
        enabled: false,
        featureDisabled: true,
        includeInBriefings: false,
        transactionDays: 7,
      });
    }
    
    try {
      const user = req.user as User;
      const settings = await storage.getSettings(user.id);
      
      res.json({
        configured: plaidService.isPlaidConfigured(),
        enabled: settings?.plaidEnabled || false,
        featureDisabled: false,
        includeInBriefings: settings?.plaidIncludeInBriefings ?? true,
        transactionDays: settings?.plaidTransactionDaysToShow ?? 7,
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get Plaid status", error);
    }
  });

  /**
   * POST /api/plaid/link-token - Create a Plaid Link token to start the connection flow
   */
  app.post("/api/plaid/link-token", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return sendErrorResponse(res, 503, "Financial integration is not available");
    }
    try {
      if (!plaidService.isPlaidConfigured()) {
        return sendErrorResponse(res, 503, "Plaid integration is not configured");
      }
      
      const user = req.user as User;
      const linkToken = await plaidService.createLinkToken(user.id);
      
      res.json({ linkToken });
    } catch (error: any) {
      // Handle specific Plaid API errors
      const plaidError = error?.response?.data;
      console.error("Plaid link-token error:", plaidError?.error_code || error.message || error);
      
      if (plaidError?.error_code === 'INVALID_PRODUCT') {
        return sendErrorResponse(res, 503, "Plaid production access required. Please wait for Plaid to approve your Transactions product access, then try again.");
      }
      if (plaidError?.error_code === 'INVALID_CONFIGURATION') {
        return sendErrorResponse(res, 503, "Plaid configuration issue. A primary product (Transactions or Auth) must be approved in your Plaid Dashboard.");
      }
      if (plaidError?.error_code) {
        return sendErrorResponse(res, 503, `Plaid error: ${plaidError.error_message || plaidError.error_code}`);
      }
      sendErrorResponse(res, 500, "Failed to create link token", error);
    }
  });

  /**
   * POST /api/plaid/exchange-token - Exchange public token for access token after user connects
   * Note: Feature is currently disabled
   */
  app.post("/api/plaid/exchange-token", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return sendErrorResponse(res, 503, "Financial integration is not available");
    }
    try {
      const user = req.user as User;
      const { publicToken, institutionId, institutionName } = req.body;
      
      if (!publicToken) {
        return sendErrorResponse(res, 400, "publicToken is required");
      }
      
      const result = await plaidService.exchangePublicToken(
        user.id,
        publicToken,
        institutionId,
        institutionName
      );
      
      // Also enable Plaid in settings if this is first connection
      const settings = await storage.getSettings(user.id);
      if (settings && !settings.plaidEnabled) {
        await storage.updateSettings(user.id, { plaidEnabled: true });
      }
      
      // Fire-and-forget auto-sync transactions after connecting
      // This runs in the background so we can respond immediately
      (async () => {
        try {
          await plaidService.syncTransactions(user.id, result.itemId);
        } catch (syncError) {
          console.error("Auto-sync failed (transactions may not be ready yet):", syncError instanceof Error ? syncError.message : syncError);
        }
      })();
      
      res.json({
        status: 'success',
        itemId: result.itemId,
        accountsConnected: result.accounts.length,
        message: 'Bank connected successfully. Transactions are syncing in the background.',
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to connect account", error);
    }
  });

  /**
   * GET /api/plaid/institutions - Get user's connected financial institutions
   * Note: Feature is currently disabled - returns empty array
   */
  app.get("/api/plaid/institutions", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return res.json([]);
    }
    try {
      const user = req.user as User;
      const institutions = await plaidService.getConnectedInstitutions(user.id);
      res.json(institutions);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get institutions", error);
    }
  });

  /**
   * DELETE /api/plaid/institutions/:itemId - Disconnect a financial institution
   * Note: Feature is currently disabled
   */
  app.delete("/api/plaid/institutions/:itemId", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return sendErrorResponse(res, 503, "Financial integration is not available");
    }
    try {
      const user = req.user as User;
      const { itemId } = req.params;
      
      await plaidService.disconnectItem(user.id, itemId);
      
      res.json({ status: 'success', message: 'Institution disconnected' });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to disconnect institution", error);
    }
  });

  /**
   * GET /api/plaid/accounts - Get user's financial accounts
   * Note: Feature is currently disabled - returns empty array
   */
  app.get("/api/plaid/accounts", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return res.json([]);
    }
    try {
      const user = req.user as User;
      const accounts = await plaidService.getAccounts(user.id);
      res.json(accounts);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get accounts", error);
    }
  });

  /**
   * PATCH /api/plaid/accounts/:accountId/visibility - Hide/show an account
   * Note: Feature is currently disabled
   */
  app.patch("/api/plaid/accounts/:accountId/visibility", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return sendErrorResponse(res, 503, "Financial integration is not available");
    }
    try {
      const user = req.user as User;
      const { accountId } = req.params;
      const { hidden } = req.body;
      
      if (typeof hidden !== 'boolean') {
        return sendErrorResponse(res, 400, "hidden must be a boolean");
      }
      
      await plaidService.hideAccount(user.id, accountId, hidden);
      
      res.json({ status: 'success' });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update account visibility", error);
    }
  });

  /**
   * POST /api/plaid/sync/:itemId - Sync transactions for an institution
   * Note: Feature is currently disabled
   */
  app.post("/api/plaid/sync/:itemId", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return sendErrorResponse(res, 503, "Financial integration is not available");
    }
    try {
      const user = req.user as User;
      const { itemId } = req.params;
      
      const result = await plaidService.syncTransactions(user.id, itemId);
      await plaidService.updateAccountBalances(user.id, itemId);
      
      res.json({
        status: 'success',
        added: result.added,
        modified: result.modified,
        removed: result.removed,
      });
    } catch (error: any) {
      // Log detailed Plaid error info
      const plaidError = error?.response?.data;
      console.error("Transaction sync error:", plaidError?.error_code || error.message || error);
      
      // Provide user-friendly error messages for common Plaid errors
      if (plaidError?.error_code === 'PRODUCT_NOT_READY') {
        return sendErrorResponse(res, 503, "Transactions are still being prepared by your bank. Please try again in a few minutes.");
      }
      if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED') {
        return sendErrorResponse(res, 401, "Your bank connection needs to be re-authenticated. Please reconnect your bank.");
      }
      if (plaidError?.error_code) {
        return sendErrorResponse(res, 503, `Bank sync error: ${plaidError.error_message || plaidError.error_code}`);
      }
      
      sendErrorResponse(res, 500, "Failed to sync transactions", error);
    }
  });

  /**
   * GET /api/plaid/transactions - Get recent transactions
   * Note: Feature is currently disabled - returns empty array
   */
  app.get("/api/plaid/transactions", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return res.json([]);
    }
    try {
      const user = req.user as User;
      const days = parseInt(req.query.days as string) || 30;
      const limit = parseInt(req.query.limit as string) || 200;
      const accountId = (req.query.accountId as string) || undefined;
      const category = (req.query.category as string) || undefined;

      const transactions = await plaidService.getFilteredTransactions(user.id, { days, limit, accountId, category });
      res.json(transactions);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get transactions", error);
    }
  });

  app.get("/api/plaid/transaction-categories", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return res.json([]);
    }
    try {
      const user = req.user as User;
      const categories = await plaidService.getTransactionCategories(user.id);
      res.json(categories);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get transaction categories", error);
    }
  });

  /**
   * GET /api/plaid/spending-summary - Get spending summary for briefings
   * Note: Feature is currently disabled - returns empty summary
   */
  app.get("/api/plaid/spending-summary", requireAuth, requireTier('life_os'), async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return res.json({ totalSpent: 0, transactionCount: 0, categories: {} });
    }
    try {
      const user = req.user as User;
      const days = parseInt(req.query.days as string) || 7;
      
      const summary = await plaidService.getSpendingSummary(user.id, days);
      res.json(summary);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get spending summary", error);
    }
  });

  /**
   * POST /api/plaid/query - Ask AI questions about financial data
   * Provides natural language answers about spending patterns and balances
   */
  app.post("/api/plaid/query", requireAuth, requireTier('life_os'), aiLimiter, async (req, res) => {
    if (!isPlaidFeatureEnabled()) {
      return res.json({ 
        answer: "Financial integration is not enabled. Please connect a bank account in Settings.",
        status: 'disabled'
      });
    }
    try {
      const user = req.user as User;
      const { query } = req.body;
      
      if (!query || typeof query !== 'string') {
        return sendErrorResponse(res, 400, "query is required");
      }
      
      // Get recent transactions (30 days) and accounts
      const [transactions, accounts, plaidUserSettings] = await Promise.all([
        plaidService.getRecentTransactions(user.id, 30, 100),
        plaidService.getAccounts(user.id),
        storage.getSettings(user.id)
      ]);
      
      const result = await answerFinancialQuery(
        query,
        transactions.map(t => ({
          date: t.date,
          amount: t.amount,
          merchantName: t.merchantName,
          name: t.name,
          primaryCategory: t.primaryCategory
        })),
        accounts.map(a => ({
          name: a.name,
          type: a.type,
          currentBalance: a.currentBalance ?? null,
          availableBalance: a.availableBalance ?? null
        })),
        plaidUserSettings?.sassLevel ?? 50,
        plaidUserSettings?.professionalMode ?? false
      );
      
      res.json({
        status: 'success',
        answer: result.answer,
        summary: result.summary,
        dataRange: {
          transactionCount: transactions.length,
          accountCount: accounts.length
        }
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to answer financial query", error);
    }
  });

  // ============================================
  // IDEAS ROUTES - Idea incubator for brainstorming
  // ============================================

  // Get all ideas for user, optionally filtered by stage and/or type
  app.get("/api/ideas", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const stage = req.query.stage as string | undefined;
      const type = req.query.type as string | undefined;
      
      const ideas = await storage.getIdeas(user.id, stage, type);
      res.json(ideas);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch ideas", error);
    }
  });

  // Get single idea with tasks
  app.get("/api/ideas/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const idea = await storage.getIdea(id, user.id);
      if (!idea) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      const tasks = await storage.getIdeaTasks(id);
      res.json({ ...idea, tasks });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch idea", error);
    }
  });

  // Create new idea
  app.post("/api/ideas", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const parsed = insertIdeaSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid idea data", parsed.error);
      }
      
      const idea = await storage.createIdea(user.id, parsed.data);
      res.status(201).json(idea);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create idea", error);
    }
  });

  // Update idea (title, description, stage, type, content, listItems)
  app.patch("/api/ideas/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const updateSchema = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        stage: z.enum([
          IDEA_STAGES.SPARK,
          IDEA_STAGES.EXPLORING,
          IDEA_STAGES.PLANNING,
          IDEA_STAGES.IN_PROGRESS,
          IDEA_STAGES.COMPLETED,
          IDEA_STAGES.DROPPED,
        ]).optional(),
        type: z.enum(['idea', 'note', 'list', 'document']).optional(),
        content: z.string().nullable().optional(),
        listItems: z.array(z.object({
          id: z.string(),
          text: z.string(),
          isChecked: z.boolean(),
          order: z.number(),
        })).optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid update data", parsed.error);
      }
      
      const updated = await storage.updateIdea(id, user.id, parsed.data);
      if (!updated) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update idea", error);
    }
  });

  // Delete idea
  app.delete("/api/ideas/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const deleted = await storage.deleteIdea(id, user.id);
      if (!deleted) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete idea", error);
    }
  });

  // Chat with AI about idea
  app.post("/api/ideas/:id/chat", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return sendErrorResponse(res, 400, "Message is required");
      }
      
      const idea = await storage.getIdea(id, user.id);
      if (!idea) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      // Add user message to chat history
      const userMessage: IdeaChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      await storage.addIdeaChatMessage(id, user.id, userMessage);
      
      // Get updated idea with new message
      const updatedIdea = await storage.getIdea(id, user.id);
      const chatHistory = (updatedIdea?.chatHistory as IdeaChatMessage[]) || [];
      
      // Build context for AI based on type
      const ideaType = idea.type || 'idea';
      let systemPrompt: string;
      
      const useStructuredEditing = ideaType === 'list' || ideaType === 'note' || ideaType === 'document';

      if (ideaType === 'list') {
        const listItems = (idea.listItems as Array<{id: string; text: string; isChecked: boolean}>) || [];
        const itemsJson = JSON.stringify(listItems.map(i => ({ text: i.text, isChecked: i.isChecked })));
        
        systemPrompt = `You are a helpful assistant for the user's list titled "${idea.title}"${idea.description ? ` (${idea.description})` : ''}.

Current list items (JSON): ${itemsJson}

IMPORTANT: You MUST always respond with valid JSON in this exact format:
{
  "message": "Your conversational response to the user",
  "updatedListItems": null or [{"text": "item text", "isChecked": false}, ...]
}

Rules:
- "message" is REQUIRED - your conversational reply explaining what you did or answering their question
- "updatedListItems" should be the COMPLETE updated list when the user asks you to add, remove, reorder, edit, or modify items. Include ALL items (both existing and new). Preserve isChecked status of existing items.
- Set "updatedListItems" to null when only answering questions or chatting without making changes
- When adding items, add them to the existing list. When removing, exclude them. When reordering, change the order.
- Be concise and practical. Always output valid JSON only, no markdown.`;
      } else if (ideaType === 'note') {
        const content = idea.content || '';
        systemPrompt = `You are a helpful assistant for the user's note titled "${idea.title}"${idea.description ? ` (${idea.description})` : ''}.

Current note content:
---
${content.substring(0, 4000)}${content.length > 4000 ? '\n...(truncated)' : ''}
---

IMPORTANT: You MUST always respond with valid JSON in this exact format:
{
  "message": "Your conversational response to the user",
  "updatedContent": null or "the full updated note content"
}

Rules:
- "message" is REQUIRED - your conversational reply explaining what you did or answering their question
- "updatedContent" should contain the COMPLETE updated note content when the user asks you to edit, add to, reorganize, rewrite, or modify the note
- Set "updatedContent" to null when only answering questions or chatting without making changes
- When editing, return the FULL content (not just the changed parts)
- Be concise and helpful. Always output valid JSON only, no markdown.`;
      } else if (ideaType === 'document') {
        const content = idea.content || '';
        systemPrompt = `You are a helpful writing assistant for the user's document titled "${idea.title}"${idea.description ? ` (${idea.description})` : ''}.

Current document content:
---
${content.substring(0, 6000)}${content.length > 6000 ? '\n...(truncated)' : ''}
---

IMPORTANT: You MUST always respond with valid JSON in this exact format:
{
  "message": "Your conversational response to the user",
  "updatedContent": null or "the full updated document content"
}

Rules:
- "message" is REQUIRED - your conversational reply explaining what you did or answering their question
- "updatedContent" should contain the COMPLETE updated document content when the user asks you to edit, rewrite, restructure, expand, or modify the document
- Set "updatedContent" to null when only answering questions, giving feedback, or chatting without making changes
- When editing, return the FULL content (not just the changed parts)
- Be constructive and supportive. Always output valid JSON only, no markdown.`;
      } else {
        systemPrompt = `You are a helpful brainstorming assistant helping the user develop their idea. 
The idea is titled "${idea.title}"${idea.description ? ` and described as: ${idea.description}` : ''}.
Current stage: ${idea.stage}

Your role is to:
- Help them explore and refine their idea
- Ask clarifying questions when needed
- Suggest ways to break down the idea into actionable steps
- Provide constructive feedback
- Help them decide if the idea is worth pursuing

Be encouraging but honest. Keep responses concise and actionable.`;
      }

      // Format chat history for OpenAI
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...chatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      ];
      
      // Call OpenAI
      const client = openai;
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: useStructuredEditing ? 4000 : 1000,
        temperature: 0.7,
        ...(useStructuredEditing ? { response_format: { type: 'json_object' as const } } : {}),
      });
      
      const rawContent = response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
      
      let displayMessage = rawContent;
      let updatedContent: string | null = null;
      let updatedListItems: Array<{text: string; isChecked: boolean}> | null = null;
      
      if (useStructuredEditing) {
        try {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            displayMessage = parsed.message || rawContent;
            if (parsed.updatedContent !== undefined && parsed.updatedContent !== null) {
              updatedContent = parsed.updatedContent;
            }
            if (parsed.updatedListItems !== undefined && parsed.updatedListItems !== null && Array.isArray(parsed.updatedListItems)) {
              updatedListItems = parsed.updatedListItems;
            }
          }
        } catch (err) {
          console.warn('Ideas chat: AI response parse failed:', err instanceof Error ? err.message : err);
          displayMessage = rawContent;
        }
      }
      
      const assistantMessage: IdeaChatMessage = {
        role: 'assistant',
        content: displayMessage,
        timestamp: new Date().toISOString(),
      };
      const finalIdea = await storage.addIdeaChatMessage(id, user.id, assistantMessage);
      
      const responseData: any = {
        message: assistantMessage,
        idea: finalIdea,
      };
      
      if (updatedContent !== null) {
        responseData.updatedContent = updatedContent;
      }
      if (updatedListItems !== null) {
        responseData.updatedListItems = updatedListItems;
      }
      
      res.json(responseData);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to chat about idea", error);
    }
  });

  // Generate tasks from idea using AI
  app.post("/api/ideas/:id/generate-tasks", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const idea = await storage.getIdea(id, user.id);
      if (!idea) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      const chatHistory = (idea.chatHistory as IdeaChatMessage[]) || [];
      const conversationContext = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');
      
      const prompt = `Based on this idea and the conversation about it, generate a list of actionable tasks/steps to make this idea a reality.

Idea Title: ${idea.title}
${idea.description ? `Description: ${idea.description}` : ''}

${conversationContext ? `Conversation so far:\n${conversationContext}` : ''}

Generate 3-7 specific, actionable tasks. Return them as a JSON array of objects with "title" and "description" fields.
Example format:
[
  {"title": "Research competitors", "description": "Look at existing solutions in the market"},
  {"title": "Define MVP features", "description": "List the minimum features needed for a first version"}
]

Return ONLY the JSON array, no other text.`;

      const client = openai;
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      });
      
      const content = response.choices[0]?.message?.content || '[]';
      
      // Parse the JSON response
      let tasks: { title: string; description?: string }[];
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        tasks = JSON.parse(jsonMatch?.[0] || '[]');
      } catch (err) {
        console.warn('Ideas tasks: AI response parse failed:', err instanceof Error ? err.message : err);
        return sendErrorResponse(res, 500, "Failed to parse AI response");
      }
      
      const existingTasks = await storage.getIdeaTasks(id);
      const startOrder = existingTasks.length;
      
      const createdTasks = await Promise.all(
        tasks.map((task, index) =>
          storage.createIdeaTask({
            ideaId: id,
            title: task.title,
            description: task.description || null,
            order: startOrder + index,
          })
        )
      );
      
      // Update idea stage to planning if still in exploring
      if (idea.stage === IDEA_STAGES.SPARK || idea.stage === IDEA_STAGES.EXPLORING) {
        await storage.updateIdea(id, user.id, { stage: IDEA_STAGES.PLANNING });
      }
      
      res.json({ tasks: createdTasks });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to generate tasks", error);
    }
  });

  // ============================================
  // IDEA TASKS ROUTES
  // ============================================

  // Create task for idea
  app.post("/api/ideas/:ideaId/tasks", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { ideaId } = req.params;
      
      // Verify idea ownership
      const idea = await storage.getIdea(ideaId, user.id);
      if (!idea) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      const parsed = insertIdeaTaskSchema.safeParse({ ...req.body, ideaId });
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid task data", parsed.error);
      }
      
      // Get current max order
      const existingTasks = await storage.getIdeaTasks(ideaId);
      const maxOrder = existingTasks.length > 0 
        ? Math.max(...existingTasks.map(t => t.order)) + 1 
        : 0;
      
      const task = await storage.createIdeaTask({
        ...parsed.data,
        order: parsed.data.order ?? maxOrder,
      });
      
      res.status(201).json(task);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create task", error);
    }
  });

  // Update task
  app.patch("/api/ideas/:ideaId/tasks/:taskId", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { ideaId, taskId } = req.params;
      
      // Verify idea ownership
      const idea = await storage.getIdea(ideaId, user.id);
      if (!idea) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      // SECURITY: Verify the task belongs to this idea (prevent cross-idea task manipulation)
      const existingTasks = await storage.getIdeaTasks(ideaId);
      const taskBelongsToIdea = existingTasks.some(t => t.id === taskId);
      if (!taskBelongsToIdea) {
        return sendErrorResponse(res, 404, "Task not found");
      }
      
      const updateSchema = z.object({
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        isCompleted: z.boolean().optional(),
        order: z.number().optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid update data", parsed.error);
      }
      
      const updated = await storage.updateIdeaTask(taskId, parsed.data);
      if (!updated) {
        return sendErrorResponse(res, 404, "Task not found");
      }
      
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update task", error);
    }
  });

  // Delete task
  app.delete("/api/ideas/:ideaId/tasks/:taskId", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { ideaId, taskId } = req.params;
      
      // Verify idea ownership
      const idea = await storage.getIdea(ideaId, user.id);
      if (!idea) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      // SECURITY: Verify the task belongs to this idea (prevent cross-idea task manipulation)
      const existingTasks = await storage.getIdeaTasks(ideaId);
      const taskBelongsToIdea = existingTasks.some(t => t.id === taskId);
      if (!taskBelongsToIdea) {
        return sendErrorResponse(res, 404, "Task not found");
      }
      
      const deleted = await storage.deleteIdeaTask(taskId);
      if (!deleted) {
        return sendErrorResponse(res, 404, "Task not found");
      }
      
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete task", error);
    }
  });

  // Reorder tasks
  app.post("/api/ideas/:ideaId/tasks/reorder", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { ideaId } = req.params;
      const { taskIds } = req.body;
      
      // Verify idea ownership
      const idea = await storage.getIdea(ideaId, user.id);
      if (!idea) {
        return sendErrorResponse(res, 404, "Idea not found");
      }
      
      if (!Array.isArray(taskIds)) {
        return sendErrorResponse(res, 400, "taskIds must be an array");
      }
      
      await storage.reorderIdeaTasks(ideaId, taskIds);
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to reorder tasks", error);
    }
  });

  // ============================================
  // GOALS ROUTES - AI-tracked user goals
  // ============================================

  // Get all goals for the user
  app.get("/api/goals", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const status = req.query.status as string | undefined;
      const goals = await storage.getGoals(user.id, status);
      res.json(goals);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch goals", error);
    }
  });

  // Get a specific goal
  app.get("/api/goals/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const goal = await storage.getGoal(req.params.id, user.id);
      if (!goal) {
        return sendErrorResponse(res, 404, "Goal not found");
      }
      res.json(goal);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch goal", error);
    }
  });

  // Create a new goal
  app.post("/api/goals", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const body = { ...req.body };
      if (body.targetDate && typeof body.targetDate === 'string') {
        body.targetDate = new Date(body.targetDate);
      }
      const parsed = insertGoalSchema.safeParse(body);
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid goal data", parsed.error);
      }
      const goal = await storage.createGoal(user.id, parsed.data);
      res.status(201).json(goal);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create goal", error);
    }
  });

  // Update a goal
  app.patch("/api/goals/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const goal = await storage.getGoal(req.params.id, user.id);
      if (!goal) {
        return sendErrorResponse(res, 404, "Goal not found");
      }
      
      const goalUpdateSchema = z.object({
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(5000).nullable().optional(),
        status: z.enum(['active', 'paused', 'completed', 'abandoned']).optional(),
        progress: z.number().min(0).max(100).optional(),
        targetDate: z.string().nullable().optional(),
        milestones: z.array(goalMilestoneSchema).optional(),
      });
      
      const parsed = goalUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid goal update data", parsed.error);
      }
      
      const updateData: Record<string, any> = { ...parsed.data };
      if (updateData.targetDate && typeof updateData.targetDate === 'string') {
        updateData.targetDate = new Date(updateData.targetDate);
      }
      if (updateData.progress !== undefined) {
        updateData.progressPercent = updateData.progress;
        delete updateData.progress;
      }
      
      const updated = await storage.updateGoal(req.params.id, user.id, updateData);
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update goal", error);
    }
  });

  // Delete a goal
  app.delete("/api/goals/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const deleted = await storage.deleteGoal(req.params.id, user.id);
      if (!deleted) {
        return sendErrorResponse(res, 404, "Goal not found");
      }
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete goal", error);
    }
  });

  // Analyze goal progress using AI
  app.post("/api/goals/:id/analyze", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const goal = await storage.getGoal(req.params.id, user.id);
      if (!goal) {
        return sendErrorResponse(res, 404, "Goal not found");
      }
      
      // Get recent memories to analyze for progress
      const [recentMemoriesRaw, goalUserSettings] = await Promise.all([
        storage.getRecentLogEntriesLight(user.id, 30, 100),
        storage.getSettings(user.id)
      ]);
      const recentMemories = recentMemoriesRaw
        .filter(m => m.memoryText)
        .map(m => ({ id: m.id, memoryText: m.memoryText!, timestamp: m.timestamp, topicTag: m.topicTag }));
      
      // Call AI to analyze progress
      const analysis = await analyzeGoalProgress({
        ...goal,
        milestones: (Array.isArray(goal.milestones) ? goal.milestones : []) as MilestoneJSON[],
      }, recentMemories, goalUserSettings?.sassLevel ?? 50, goalUserSettings?.professionalMode ?? false);
      
      // Update the goal with AI analysis
      const updated = await storage.updateGoal(req.params.id, user.id, {
        progressPercent: analysis.progressPercent,
        aiSummary: analysis.summary,
        aiLastAnalyzed: new Date(),
        relatedMemoryIds: analysis.relatedMemoryIds,
      });
      
      res.json({
        goal: updated,
        analysis,
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to analyze goal progress", error);
    }
  });

  // Get suggested milestones for a goal
  app.post("/api/goals/:id/suggest-milestones", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const goal = await storage.getGoal(req.params.id, user.id);
      if (!goal) {
        return sendErrorResponse(res, 404, "Goal not found");
      }
      
      const milestoneUserSettings = await storage.getSettings(user.id);
      const suggestions = await suggestGoalMilestones({
        ...goal,
        milestones: (Array.isArray(goal.milestones) ? goal.milestones : []) as MilestoneJSON[],
      }, milestoneUserSettings?.sassLevel ?? 50, milestoneUserSettings?.professionalMode ?? false);
      res.json({ suggestions });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to generate milestone suggestions", error);
    }
  });

  // GET /api/goals/alerts - Get goal-related pattern alerts
  app.get("/api/goals/alerts", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const goals = await storage.getActiveGoals(user.id);
      
      if (goals.length === 0) {
        return res.json({ alerts: [] });
      }
      
      const recentMemoriesRaw = await storage.getRecentLogEntriesLight(user.id, 14, 50);
      const recentMemories = recentMemoriesRaw
        .filter(m => m.memoryText && m.timestamp)
        .map(m => ({ memoryText: m.memoryText!, timestamp: m.timestamp! }));
      
      const alerts = await detectGoalPatternAlerts(
        goals.map(g => ({
          title: g.title,
          description: g.description,
          progressPercent: g.progressPercent,
          status: g.status,
          targetDate: g.targetDate,
          aiLastAnalyzed: g.aiLastAnalyzed,
          milestones: ((Array.isArray(g.milestones) ? g.milestones : []) as MilestoneJSON[]).map(m => ({
            title: m.title || '',
            isCompleted: m.isCompleted ?? false,
            completedAt: m.completedAt,
          })),
        })),
        recentMemories
      );
      
      res.json({ alerts });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to detect goal alerts", error);
    }
  });

  // ============================================
  // REMINDERS ROUTES
  // ============================================

  // Get all reminders for user
  app.get("/api/reminders", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const status = req.query.status as string | undefined;
      const reminders = await storage.getReminders(user.id, status);
      res.json(reminders);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch reminders", error);
    }
  });

  // Get a specific reminder
  app.get("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const reminder = await storage.getReminder(req.params.id, user.id);
      if (!reminder) {
        return sendErrorResponse(res, 404, "Reminder not found");
      }
      res.json(reminder);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch reminder", error);
    }
  });

  // Create a new reminder
  app.post("/api/reminders", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const body = { ...req.body };
      
      // Convert triggerTime string to Date if provided
      if (body.triggerTime && typeof body.triggerTime === 'string') {
        body.triggerTime = new Date(body.triggerTime);
      }
      
      const parsed = insertReminderSchema.safeParse(body);
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid reminder data", parsed.error);
      }
      
      const reminder = await storage.createReminder(user.id, parsed.data);
      // Clear briefing cache so next load reflects the new reminder
      await storage.invalidateAiCache(user.id, 'briefing');
      res.status(201).json(reminder);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create reminder", error);
    }
  });

  // Update a reminder
  app.patch("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const reminder = await storage.getReminder(req.params.id, user.id);
      if (!reminder) {
        return sendErrorResponse(res, 404, "Reminder not found");
      }
      
      const updateSchema = z.object({
        content: z.string().min(1).max(1000).optional(),
        triggerType: z.enum(['time', 'location']).optional(),
        triggerTime: z.string().optional(),
        triggerLocationName: z.string().max(200).optional(),
        status: z.enum(['pending', 'triggered', 'snoozed', 'completed', 'dismissed']).optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid update data", parsed.error);
      }
      
      const updates: Record<string, any> = { ...parsed.data };
      if (updates.triggerTime && typeof updates.triggerTime === 'string') {
        updates.triggerTime = new Date(updates.triggerTime);
      }
      
      const updated = await storage.updateReminder(req.params.id, user.id, updates);
      // Clear briefing cache so next load reflects the updated reminder
      await storage.invalidateAiCache(user.id, 'briefing');
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update reminder", error);
    }
  });

  // Delete a reminder
  app.delete("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const deleted = await storage.deleteReminder(req.params.id, user.id);
      if (!deleted) {
        return sendErrorResponse(res, 404, "Reminder not found");
      }
      // Clear briefing cache so the deleted reminder no longer appears in Focus Areas
      await storage.invalidateAiCache(user.id, 'briefing');
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete reminder", error);
    }
  });

  // Complete a reminder
  app.post("/api/reminders/:id/complete", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const completed = await storage.completeReminder(req.params.id, user.id);
      if (!completed) {
        return sendErrorResponse(res, 404, "Reminder not found");
      }
      // Clear briefing cache so completed reminder is removed from next briefing
      await storage.invalidateAiCache(user.id, 'briefing');
      res.json(completed);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to complete reminder", error);
    }
  });

  // Snooze a reminder
  app.post("/api/reminders/:id/snooze", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { minutes = 30 } = req.body;
      const until = new Date(Date.now() + minutes * 60 * 1000);
      
      const snoozed = await storage.snoozeReminder(req.params.id, user.id, until);
      if (!snoozed) {
        return sendErrorResponse(res, 404, "Reminder not found");
      }
      // Clear briefing cache so snoozed reminder reflects updated time
      await storage.invalidateAiCache(user.id, 'briefing');
      res.json(snoozed);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to snooze reminder", error);
    }
  });

  // Dismiss a reminder
  app.post("/api/reminders/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const dismissed = await storage.dismissReminder(req.params.id, user.id);
      if (!dismissed) {
        return sendErrorResponse(res, 404, "Reminder not found");
      }
      // Clear briefing cache so dismissed reminder no longer appears
      await storage.invalidateAiCache(user.id, 'briefing');
      res.json(dismissed);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to dismiss reminder", error);
    }
  });

  // Unsnooze a reminder (restore to pending, clear snoozedUntil)
  app.post("/api/reminders/:id/unsnooze", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const unsnoozed = await storage.unsnoozeReminder(req.params.id, user.id);
      if (!unsnoozed) {
        return sendErrorResponse(res, 404, "Reminder not found");
      }
      // Clear briefing cache so unsnoozed reminder reappears in next briefing
      await storage.invalidateAiCache(user.id, 'briefing');
      res.json(unsnoozed);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to unsnooze reminder", error);
    }
  });

  // Check and trigger due reminders (called on app load/periodic check)
  app.post("/api/reminders/check-due", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const now = new Date();
      
      // Get pending time-based reminders that are due
      const dueReminders = await storage.getPendingTimeReminders(user.id, now);
      
      // Also check snoozed reminders that are past their snooze time
      const allReminders = await storage.getReminders(user.id, 'snoozed');
      const snoozedDue = allReminders.filter(r => 
        r.snoozedUntil && new Date(r.snoozedUntil) <= now
      );
      
      // Trigger all due reminders
      const triggered: Reminder[] = [];
      for (const reminder of [...dueReminders, ...snoozedDue]) {
        const result = await storage.triggerReminder(reminder.id, user.id);
        if (result) triggered.push(result);
      }
      
      res.json({ 
        triggered,
        count: triggered.length 
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to check due reminders", error);
    }
  });

  // Get pending location reminders for location matching
  app.get("/api/reminders/location-pending", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const reminders = await storage.getPendingLocationReminders(user.id);
      res.json(reminders);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch location reminders", error);
    }
  });

  // ============================================
  // LOCATION HISTORY ROUTES - Google Timeline import
  // ============================================

  // Get location history statistics
  app.get("/api/locations/stats", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      const [count, frequentPlacesList, recentLocations] = await Promise.all([
        storage.getLocationHistoryCount(user.id),
        storage.getFrequentPlaces(user.id),
        storage.getRecentLocations(user.id, 7, 10)
      ]);
      
      res.json({
        totalLocations: count,
        frequentPlacesCount: frequentPlacesList.length,
        hasHomeSet: frequentPlacesList.some(p => p.label === 'home' && p.isConfirmed),
        hasWorkSet: frequentPlacesList.some(p => p.label === 'work' && p.isConfirmed),
        recentLocationsCount: recentLocations.length,
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch location stats", error);
    }
  });

  // Get location history with pagination
  app.get("/api/locations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      
      const locations = await storage.getLocationHistory(user.id, limit, offset);
      const total = await storage.getLocationHistoryCount(user.id);
      
      res.json({
        locations,
        total,
        hasMore: offset + locations.length < total
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch location history", error);
    }
  });

  app.post("/api/locations/import", requireAuth, express.json({ limit: '50mb' }), async (req, res) => {
    try {
      const user = req.user as User;
      const { jsonContent } = req.body;
      
      if (!jsonContent || typeof jsonContent !== 'string') {
        return sendErrorResponse(res, 400, "JSON content is required");
      }
      
      
      // Parse the file
      const parsedLocations = parseGoogleTakeoutFile(jsonContent);
      
      if (parsedLocations.length === 0) {
        return sendErrorResponse(res, 400, "No valid locations found in the file");
      }
      
      // Generate batch ID
      const importBatchId = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Convert to insert format
      const locationsToInsert = parsedLocations.map(loc => 
        convertToInsertLocation(user.id, loc, importBatchId)
      );
      
      // Insert in batches
      const insertedCount = await storage.createLocationHistoryBatch(locationsToInsert);
      
      // Fetch all locations to detect patterns
      const allLocations = await storage.getLocationHistory(user.id, 5000);
      
      // Cluster locations and detect frequent places
      const clusters = clusterLocations(allLocations);
      const detectedPlaces = detectFrequentPlaces(clusters, user.id, 3);
      
      // Upsert frequent places
      const placesUpserted = await storage.upsertFrequentPlaces(detectedPlaces);
      
      res.json({
        success: true,
        importBatchId,
        locationsImported: insertedCount,
        placesDetected: placesUpserted,
        dateRange: parsedLocations.length > 0 ? {
          start: parsedLocations[0].timestamp.toISOString(),
          end: parsedLocations[parsedLocations.length - 1].timestamp.toISOString()
        } : undefined
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to import location data", error);
    }
  });

  // Import pre-parsed locations (client-side parsing for large files)
  app.post("/api/locations/import-parsed", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { locations } = req.body;
      
      if (!locations || !Array.isArray(locations) || locations.length === 0) {
        return sendErrorResponse(res, 400, "Locations array is required");
      }
      
      
      // Generate batch ID
      const importBatchId = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Convert client-parsed format to insert format
      const locationsToInsert = locations.map((loc: { lat: number; lng: number; ts: string; src?: string; acc?: number }) => ({
        userId: user.id,
        latitude: loc.lat,
        longitude: loc.lng,
        timestamp: new Date(loc.ts),
        source: 'google_takeout' as const,
        importBatchId,
        accuracyMeters: loc.acc,
      }));
      
      // Insert in batches
      const insertedCount = await storage.createLocationHistoryBatch(locationsToInsert);
      
      // Fetch all locations to detect patterns
      const allLocations = await storage.getLocationHistory(user.id, 5000);
      
      // Cluster locations and detect frequent places
      const clusters = clusterLocations(allLocations);
      const detectedPlaces = detectFrequentPlaces(clusters, user.id, 3);
      
      // Upsert frequent places
      const placesUpserted = await storage.upsertFrequentPlaces(detectedPlaces);
      
      // Calculate date range
      const timestamps = locations.map((l: { ts: string }) => new Date(l.ts).getTime()).filter((t: number) => !isNaN(t));
      const minTs = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
      const maxTs = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
      
      res.json({
        success: true,
        importBatchId,
        locationsImported: insertedCount,
        placesDetected: placesUpserted,
        dateRange: minTs && maxTs ? {
          start: minTs.toISOString(),
          end: maxTs.toISOString()
        } : undefined
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to import location data", error);
    }
  });

  // Delete an import batch
  app.delete("/api/locations/batch/:batchId", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { batchId } = req.params;
      
      const deletedCount = await storage.deleteLocationHistoryBatch(user.id, batchId);
      
      res.json({
        success: true,
        deletedCount
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete location batch", error);
    }
  });

  // Delete all location history
  app.delete("/api/locations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      const deletedCount = await storage.deleteAllLocationHistory(user.id);
      
      res.json({
        success: true,
        deletedCount
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete location history", error);
    }
  });

  // ============================================
  // FREQUENT PLACES ROUTES
  // ============================================

  // Get all frequent places
  app.get("/api/locations/places", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const places = await storage.getFrequentPlaces(user.id);
      res.json(places.filter(p => !p.isHidden));
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch frequent places", error);
    }
  });

  // Get hidden frequent places
  app.get("/api/locations/places/hidden", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const places = await storage.getFrequentPlaces(user.id);
      res.json(places.filter(p => p.isHidden));
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch hidden places", error);
    }
  });

  // Update a frequent place (set name, label, confirm, hide)
  app.patch("/api/locations/places/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const updateSchema = z.object({
        name: z.string().optional(),
        label: z.string().optional(),
        isConfirmed: z.boolean().optional(),
        isHidden: z.boolean().optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendErrorResponse(res, 400, "Invalid update data", parsed.error);
      }
      
      const updated = await storage.updateFrequentPlace(id, user.id, parsed.data);
      if (!updated) {
        return sendErrorResponse(res, 404, "Place not found");
      }
      
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update place", error);
    }
  });

  // Delete a frequent place
  app.delete("/api/locations/places/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const deleted = await storage.deleteFrequentPlace(id, user.id);
      if (!deleted) {
        return sendErrorResponse(res, 404, "Place not found");
      }
      
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete place", error);
    }
  });

  // Geocode places without addresses
  app.post("/api/locations/places/geocode", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const places = await storage.getFrequentPlaces(user.id);
      
      // Filter places without addresses
      const placesToGeocode = places.filter(p => !p.address && !p.isHidden);
      
      if (placesToGeocode.length === 0) {
        return res.json({ success: true, geocoded: 0 });
      }
      
      
      let geocodedCount = 0;
      for (const place of placesToGeocode.slice(0, 10)) { // Limit to 10 at a time
        const address = await reverseGeocode(place.latitude, place.longitude);
        if (address) {
          await storage.updateFrequentPlace(place.id, user.id, { address });
          geocodedCount++;
        }
        // Rate limit: 1 request per second for Nominatim
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
      
      res.json({ success: true, geocoded: geocodedCount, remaining: Math.max(0, placesToGeocode.length - 10) });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to geocode places", error);
    }
  });

  // Get location context for AI (formatted for briefings)
  app.get("/api/locations/context", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      
      
      const [frequentPlacesList, recentLocations, totalCount] = await Promise.all([
        storage.getFrequentPlaces(user.id),
        storage.getRecentLocations(user.id, 14, 100),
        storage.getLocationHistoryCount(user.id)
      ]);
      
      const patterns = buildLocationContext(frequentPlacesList, recentLocations, totalCount);
      const formatted = formatLocationContextForAI(patterns);
      
      res.json({
        patterns,
        formattedContext: formatted
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch location context", error);
    }
  });

  /**
   * PUSH NOTIFICATION ROUTES
   * Web push notifications for proactive alerts and briefings
   */

  app.get("/api/push/vapid-key", requireAuth, (_req, res) => {
    const publicKey = getVapidPublicKey();
    res.json({ publicKey, disabled: !isPushConfigured() });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    if (!isPushConfigured()) {
      return res.json({ success: false, disabled: true, message: "Push notifications not configured" });
    }

    const user = req.user as User;
    const { subscription, userAgent } = req.body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return sendErrorResponse(res, 400, "Invalid subscription object");
    }

    try {
      await storage.createPushSubscription({
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || req.headers['user-agent'] || null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Push subscribe error:', error);
      return sendErrorResponse(res, 500, "Failed to save subscription");
    }
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    const { endpoint } = req.body;

    if (!endpoint) {
      return sendErrorResponse(res, 400, "Endpoint required");
    }

    try {
      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      console.error('Push unsubscribe error:', error);
      return sendErrorResponse(res, 500, "Failed to remove subscription");
    }
  });

  app.get("/api/push/status", requireAuth, async (req, res) => {
    const user = req.user as User;

    try {
      const subscriptions = await storage.getPushSubscriptions(user.id);
      res.json({
        enabled: isPushConfigured(),
        deviceCount: subscriptions.length,
        devices: subscriptions.map(s => ({
          id: s.id,
          userAgent: s.userAgent,
          createdAt: s.createdAt,
          lastUsed: s.lastUsed,
        })),
      });
    } catch (error) {
      console.error('Push status error:', error);
      return sendErrorResponse(res, 500, "Failed to get subscription status");
    }
  });

  app.post("/api/push/test", requireAuth, async (req, res) => {
    if (!isPushConfigured()) {
      return res.json({ success: false, disabled: true, message: "Push notifications not configured" });
    }

    const user = req.user as User;

    // Send response immediately, then send notification in background
    res.json({ success: true, message: "Test notification sent" });

    setImmediate(async () => {
      try {
        await sendPushToAllUserDevices(user.id, {
          type: 'test',
          title: 'Keryx Test Notification',
          body: 'Push notifications are working! You\'ll receive alerts about briefings, insights, and important reminders.',
          url: '/settings',
        });
      } catch (error) {
        console.error('Test push notification error:', error);
      }
    });
  });

  // ============================================
  // MESSAGE IMPORT & BROWSING ROUTES
  // ============================================

  app.post("/api/messages/import", requireAuth, express.json({ limit: '100mb' }), async (req, res) => {
    let importRecord: any = null;
    try {
      const user = req.user as User;
      const { fileContent, fileName } = req.body;

      if (!fileContent || typeof fileContent !== 'string') {
        return res.status(400).json({ message: "No file content provided" });
      }

      const batchId = `sms-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      importRecord = await storage.createMessageImport({
        userId: user.id,
        batchId,
        source: 'sms_import',
        fileName: fileName || 'messages.ndjson',
        status: 'processing',
      });

      const result = await parseAndImportNDJSON(user.id, fileContent, batchId, fileName);

      await storage.updateMessageImport(importRecord.id, user.id, {
        totalMessages: result.totalParsed,
        newMessages: result.newMessages,
        duplicateMessages: result.duplicates,
        status: result.errors > result.totalParsed / 2 ? 'completed_with_errors' : 'completed',
        completedAt: new Date(),
        errorMessage: result.errors > 0 ? `${result.errors} entries failed to parse` : null,
      });

      await storage.invalidateAiCache(user.id);

      res.json({
        success: true,
        importId: importRecord.id,
        batchId,
        ...result,
      });

      if (result.newMessages > 0) {
        setImmediate(async () => {
          try {
            let retries = 0;
            while (retries < 3) {
              const unprocessed = await storage.getUnprocessedMessages(user.id, 50);
              if (unprocessed.length === 0) break;
              try {
                await processMessageBatch(user.id, unprocessed);
                retries = 0;
              } catch (batchErr) {
                retries++;
                if (retries < 3) {
                  await new Promise(r => setTimeout(r, 5000 * retries));
                }
              }
            }
            await storage.invalidateAiCache(user.id);
          } catch (err) {
            console.error('Background message AI processing failed:', err);
          }
        });
      }
    } catch (error: any) {
      console.error('SMS import failed:', error);
      try {
        const user = req.user as User;
        if (importRecord && user) {
          await storage.updateMessageImport(importRecord.id, user.id, {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: error.message || 'Unknown error',
          });
        }
      } catch (updateErr) { console.warn('Messages import: failed to update import status:', updateErr instanceof Error ? updateErr.message : updateErr); }
      const userMessage = error.message?.includes('format') || error.message?.includes('parse') || error.message?.includes('XML')
        ? error.message
        : "Failed to import messages. Check the file format — export as JSON (NDJSON) from the SMS app.";
      res.status(500).json({ message: userMessage });
    }
  });

  app.get("/api/messages/imports", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const imports = await storage.getMessageImports(user.id);
      res.json(imports);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch import history", error);
    }
  });

  app.get("/api/messages/conversations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const [conversations, total] = await Promise.all([
        storage.getMessageConversations(user.id, limit, offset),
        storage.getMessageConversationsCount(user.id),
      ]);
      res.json({ conversations, total, limit, offset });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch conversations", error);
    }
  });

  const MESSAGE_SORT_FIELDS = ['contactName', 'platform', 'messageCount', 'lastMessageAt'] as const;

  app.post("/api/messages/ai-search", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const validation = aiSearchSchema.safeParse(req.body);

      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }

      const { query } = validation.data;
      const allConversations = await storage.getMessageConversations(user.id, 1000, 0);

      if (allConversations.length === 0) {
        return res.json({ status: 'success', data: { sortFields: [{ field: 'lastMessageAt', direction: 'desc' }], filterIds: null, message: 'No conversations found.' } });
      }

      const validIds = new Set(allConversations.map(c => c.id));

      const convSummary = allConversations.slice(0, 500).map(c => ({
        id: c.id,
        contactName: c.contactName || c.contactAddress,
        contactAddress: c.contactAddress,
        platform: c.platform || 'sms',
        messageCount: c.messageCount || 0,
        lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt).toISOString().split('T')[0] : 'unknown',
      }));

      const openaiClient = openai;

      const response = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a search/sort/filter assistant for a text message conversations list. The user has ${allConversations.length} conversations.

Available fields for sorting: contactName, platform, messageCount, lastMessageAt
Available platforms: sms, mms, rcs

Given the user's natural language query, return a JSON object with:
- "sortFields": an array of sort criteria, each with { "field": string, "direction": "asc" | "desc" }. Order matters: first entry is primary sort. Use an empty array [] if no sort needed.
- "filterIds": array of matching conversation IDs if filtering/searching, or null if showing all (just sorting)
- "message": a brief friendly description of what you did

IMPORTANT RULES:
- For search queries (finding specific contacts), return only matching IDs in filterIds
- For sort queries, set filterIds to null (show all, just reorder)
- For filter queries (e.g., "show sms only"), return matching IDs in filterIds
- For combined queries (e.g., "sms sorted by messages"), filter AND sort
- "most messages" or "most active" = messageCount desc
- "recent" or "latest" = lastMessageAt desc
- "oldest" = lastMessageAt asc
- "alphabetical" or "by name" = contactName asc
- Contact name searches should be fuzzy — match partial names, nicknames, phone numbers
- If the query is ambiguous, do your best interpretation
- Always provide a helpful message explaining the result

Respond with JSON only.`
          },
          {
            role: "user",
            content: `Query: "${query.trim()}"\n\nConversations data:\n${JSON.stringify(convSummary)}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      let result: any;
      try {
        result = JSON.parse(response.choices[0].message.content || "{}");
      } catch {
        return res.json({
          status: 'success',
          data: { sortFields: [{ field: 'lastMessageAt', direction: 'desc' as const }], filterIds: null, message: 'Could not interpret query. Showing all conversations by recent.' }
        });
      }

      const sortFields: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
      if (Array.isArray(result.sortFields)) {
        for (const sf of result.sortFields) {
          if (sf && typeof sf.field === 'string' && (MESSAGE_SORT_FIELDS as readonly string[]).includes(sf.field)) {
            sortFields.push({
              field: sf.field,
              direction: sf.direction === 'desc' ? 'desc' : 'asc',
            });
          }
        }
      }

      const filterIds = Array.isArray(result.filterIds)
        ? result.filterIds.filter((id: string) => typeof id === 'string' && validIds.has(id))
        : null;

      res.json({
        status: 'success',
        data: {
          sortFields,
          filterIds: filterIds && filterIds.length > 0 ? filterIds : (Array.isArray(result.filterIds) ? [] : null),
          message: typeof result.message === 'string' ? result.message.slice(0, 200) : 'Search complete',
        }
      });
    } catch (error) {
      console.error("AI messages search failed:", error);
      sendErrorResponse(res, 500, "AI search failed", error);
    }
  });

  app.patch("/api/messages/conversations/:id/name", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { contactName } = req.body;
      if (!contactName || typeof contactName !== 'string' || contactName.trim().length === 0) {
        return sendErrorResponse(res, 400, "Contact name is required");
      }
      const updated = await storage.updateConversationContactName(req.params.id, user.id, contactName.trim());
      if (!updated) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      let personSynced = false;
      let personSyncWarning: string | undefined;
      try {
        const phoneNumber = updated.contactAddress;
        const trimmedName = contactName.trim();
        const existingPerson = await storage.getPersonByPhone(user.id, phoneNumber);
        const nameConflict = await storage.getPerson(user.id, trimmedName);
        
        if (existingPerson) {
          if (!nameConflict || nameConflict.id === existingPerson.id) {
            await storage.updatePerson(user.id, existingPerson.id, { name: trimmedName, phoneNumber });
            personSynced = true;
          } else {
            personSyncWarning = `A person named "${trimmedName}" already exists — the People record was not renamed to avoid a duplicate.`;
          }
        } else {
          const phonePerson = await storage.getPerson(user.id, phoneNumber);
          if (phonePerson) {
            if (!nameConflict || nameConflict.id === phonePerson.id) {
              await storage.updatePerson(user.id, phonePerson.id, { name: trimmedName, phoneNumber });
              personSynced = true;
            } else {
              personSyncWarning = `A person named "${trimmedName}" already exists — the People record was not renamed to avoid a duplicate.`;
            }
          } else if (!nameConflict) {
            await storage.upsertPerson(user.id, trimmedName, 'messages', phoneNumber);
            personSynced = true;
          } else {
            personSyncWarning = `A person named "${trimmedName}" already exists — linked the conversation but kept the existing People record name.`;
          }
        }
      } catch (syncErr) {
        console.error('Failed to sync person name from conversation rename:', syncErr);
      }

      res.json({ ...updated, personSynced, personSyncWarning });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update contact name", error);
    }
  });

  app.get("/api/messages/conversations/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const conversation = await storage.getMessageConversation(req.params.id, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch conversation", error);
    }
  });

  app.get("/api/messages/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const conversationId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const conversation = await storage.getMessageConversation(conversationId, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const [msgs, total] = await Promise.all([
        storage.getMessages(user.id, conversationId, limit, offset),
        storage.getMessagesCount(user.id, conversationId),
      ]);
      res.json({ messages: msgs, total, limit, offset });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch messages", error);
    }
  });

  app.get("/api/messages/by-date", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const dateStr = req.query.date as string;
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return sendErrorResponse(res, 400, "Date parameter required in YYYY-MM-DD format");
      }
      const parsed = new Date(dateStr + 'T12:00:00');
      if (isNaN(parsed.getTime())) {
        return sendErrorResponse(res, 400, "Invalid date value");
      }

      const settings = await storage.getSettings(user.id);
      const userTz = settings?.userTimezone || 'America/Denver';

      const localToUtc = (localDate: Date, tz: string): Date => {
        const localMs = localDate.getTime();
        const inTz = new Date(localDate.toLocaleString('en-US', { timeZone: tz }));
        return new Date(localMs + (localMs - inTz.getTime()));
      };

      const utcStart = localToUtc(new Date(`${dateStr}T00:00:00`), userTz);
      const utcEnd = localToUtc(new Date(`${dateStr}T23:59:59.999`), userTz);

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const msgs = await storage.getMessagesByDateRange(user.id, utcStart, utcEnd, limit);
      const sanitized = msgs.map(({ embeddingVector: _, ...rest }) => rest);
      res.json({ status: 'success', data: sanitized });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch messages for date", error);
    }
  });

  app.get("/api/messages/stats", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const [totalConversations, totalMessages] = await Promise.all([
        storage.getMessageConversationsCount(user.id),
        storage.getMessagesCount(user.id),
      ]);
      res.json({ totalConversations, totalMessages });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch message stats", error);
    }
  });

  app.get("/api/messages/processing-status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const status = await storage.getMessageProcessingStatus(user.id);
      res.json(status);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch processing status", error);
    }
  });

  app.post("/api/messages/process-ai", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const limit = parseInt(req.query.limit as string) || 50;
      const unprocessed = await storage.getUnprocessedMessages(user.id, limit);

      if (unprocessed.length === 0) {
        return res.json({ processed: 0, remaining: 0, message: "No unprocessed messages" });
      }

      const processed = await processMessageBatch(user.id, unprocessed);
      const updatedStatus = await storage.getMessageProcessingStatus(user.id);

      res.json({ processed, remaining: updatedStatus.unprocessed, total: updatedStatus.total });

      if (updatedStatus.unprocessed > 0) {
        setImmediate(async () => {
          try {
            let retries = 0;
            while (retries < 3) {
              const batch = await storage.getUnprocessedMessages(user.id, 50);
              if (batch.length === 0) break;
              try {
                await processMessageBatch(user.id, batch);
                retries = 0;
              } catch (batchErr) {
                retries++;
                console.warn(`Background message batch retry ${retries}/3:`, batchErr instanceof Error ? batchErr.message : batchErr);
                if (retries < 3) await new Promise(r => setTimeout(r, 5000 * retries));
              }
            }
            await storage.invalidateAiCache(user.id);
          } catch (err) {
            console.error('Background message AI continuation failed:', err);
          }
        });
      }
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to process messages", error);
    }
  });

  /**
   * GET /api/billing/status - Returns current subscription info for the authenticated user
   */
  app.get("/api/billing/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const isFoundingMember = !user.currentPeriodEnd && user.subscriptionTier !== 'free';
      const memoriesLimit = user.subscriptionTier === 'free' ? 100 : null;
      res.json({
        tier: user.subscriptionTier,
        status: user.subscriptionStatus,
        memoriesThisMonth: user.memoriesThisMonth || 0,
        memoriesLimit,
        currentPeriodEnd: user.currentPeriodEnd || null,
        isFoundingMember,
        stripeCustomerId: user.stripeCustomerId || null,
        stripeConfigured: isStripeConfigured(),
        enforcementActive: process.env.BILLING_ENFORCEMENT === 'true',
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get billing status", error);
    }
  });

  /**
   * POST /api/billing/checkout - Create a Stripe Checkout session for upgrading
   * Body: { tier: 'pro' | 'life_os', successUrl: string, cancelUrl: string }
   */
  app.post("/api/billing/checkout", requireAuth, async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ error: 'Stripe not configured', billingNotReady: true });
      }
      const user = req.user as User;
      const { tier, successUrl, cancelUrl } = req.body;
      if (!['pro', 'life_os'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be pro or life_os' });
      }
      const priceId = tier === 'pro' ? process.env.STRIPE_PRICE_PRO! : process.env.STRIPE_PRICE_LIFE_OS!;
      const appBase = req.headers.origin || `${req.protocol}://${req.get('host')}`;
      const url = await createCheckoutSession({
        userId: user.id,
        username: user.username,
        priceId,
        successUrl: successUrl || `${appBase}/billing?success=true`,
        cancelUrl: cancelUrl || `${appBase}/billing?canceled=true`,
      });
      res.json({ url });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create checkout session", error);
    }
  });

  /**
   * POST /api/billing/portal - Create a Stripe Customer Portal session for managing subscription
   */
  app.post("/api/billing/portal", requireAuth, async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ error: 'Stripe not configured', billingNotReady: true });
      }
      const user = req.user as User;
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: 'No Stripe customer record found. Please upgrade first.' });
      }
      const appBase = req.headers.origin || `${req.protocol}://${req.get('host')}`;
      const url = await createPortalSession(user.stripeCustomerId, `${appBase}/billing`);
      res.json({ url });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create portal session", error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
