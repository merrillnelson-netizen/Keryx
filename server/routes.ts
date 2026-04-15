import express, { type Express, type Response } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { insertSettingsSchema, insertUserSchema, insertCategorySchema, insertPersonSchema, mcpPayloadSchema, insertIdeaSchema, insertIdeaTaskSchema, insertGoalSchema, goalMilestoneSchema, insertReminderSchema, insertRelayDestinationSchema, automationConditionsSchema, IDEA_STAGES, insertProfileObservationSchema, type User, type IdeaChatMessage, type InsertLogEntry, type InsertReminder, type Reminder, type Goal, type Person, type GoalMilestone, type AiChatMessage, type LogEntry } from "@shared/schema";
import { z } from "zod";
import { openai, extractMetadata, generateEmbedding, decomposeQuery, synthesizeSearchAnswer, generateThematicInsights, generateMorningBriefing, detectPatternAlerts, answerFinancialQuery, generatePersonalNewsFeed, PersonalNewsFeed, detectIntent, analyzeGoalProgress, suggestGoalMilestones, GoalContext, detectGoalPatternAlerts, detectCalendarEvent, formatDateForTimezone, formatDateTimeForTimezone, generateEcosystemCaptions, type EcosystemCaptions } from "./ai-service";
import bcrypt from "bcrypt";
import passport from "./auth";
import { requireAuth, withSettings } from "./auth";
import rateLimit from "express-rate-limit";
import { isCalendarConnected, isGoogleCalendarConnected, getTodaysEvents, getUpcomingEvents, findRelevantEvent, createCalendarEvent, findDuplicateEvent } from "./calendar-service";
import { isOutlookConnected } from "./outlook-calendar-service";
import { isGmailConnected, getGmailCapabilities, getRecentEmails } from "./gmail-service";
import { isOutlookMailConnected, getOutlookRecentEmails } from "./outlook-mail-service";
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
import { 
  getGoogleAuthUrl, exchangeGoogleCode, 
  getMicrosoftAuthUrl, exchangeMicrosoftCode, 
  deleteTokens, hasValidToken, generateOauthState, validateOauthState, getAccountEmail
} from "./oauth-token-manager";

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

// Rate limiter for the public relay inbound endpoint (keyed on X-API-Key header)
const relayInboundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded. Max 60 requests/minute per API key.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.headers['x-api-key'] as string | undefined) ?? 'unknown',
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

// Rate limiter for the session-authenticated relay test endpoint
const relayTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Rate limit exceeded. Max 120 test requests/minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = req.user as User | undefined;
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
      let user = await storage.createUser({
        username,
        password: hashedPassword,
      });

      // During early access (billing enforcement off), grant life_os so the UI shows
      // full access. When BILLING_ENFORCEMENT=true is set, new users will start on free.
      if (process.env.BILLING_ENFORCEMENT !== 'true') {
        user = await storage.updateUser(user.id, {
          subscriptionTier: 'life_os',
          subscriptionStatus: 'active',
        });
      }
      
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
          const relevantEvent = await findRelevantEvent(new Date(), user.id);
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
            processUserInputForActions(user.id, memoryText, 'memory', logEntry.id, { timezone, userProfile: settingsForCalendar?.userProfile })
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

          // Fire automation triggers for memory.logged (and keyword.detected, person.mentioned, mood.*)
          import('./automation-engine').then(({ fireTrigger, AUTOMATION_TRIGGERS }) => {
            const moodScore = extracted.moodScore ?? undefined;
            // Derive aiSentiment from the AI's mood label (primary source — intent-aware)
            // Fallback to moodScore on -100..100 scale if mood label is unrecognized
            const POSITIVE_MOODS = new Set(['happy', 'excited', 'hopeful', 'grateful', 'peaceful', 'proud', 'motivated', 'nostalgic']);
            const NEGATIVE_MOODS = new Set(['sad', 'anxious', 'frustrated', 'stressed', 'angry', 'confused']);
            const moodLabel = (extracted.mood || 'neutral').toLowerCase();
            const aiSentiment: 'positive' | 'neutral' | 'negative' =
              POSITIVE_MOODS.has(moodLabel) ? 'positive'
              : NEGATIVE_MOODS.has(moodLabel) ? 'negative'
              : moodScore !== undefined
                ? moodScore > 20 ? 'positive' : moodScore < -20 ? 'negative' : 'neutral'
                : 'neutral';
            // aiMoodLabel: the raw AI-assigned mood string (e.g. "stressed", "happy")
            const aiMoodLabel = extracted.mood || undefined;
            const aiTopics = extracted.topicTag ? [extracted.topicTag] : [];
            const aiPeople = extracted.detectedPeople || [];
            const ctx = {
              userId: user.id,
              memoryContent: memoryText,
              moodScore,
              topics: aiTopics,
              peopleNames: aiPeople,
              // Enriched AI fields for advanced condition matching
              aiTopics,
              aiPeople,
              aiMoodLabel,
              aiSentiment,
            };

            // memory.logged
            fireTrigger(user.id, AUTOMATION_TRIGGERS.MEMORY_LOGGED, ctx).catch(() => {});

            // mood.dropped / mood.spiked
            if (extracted.moodScore !== undefined && extracted.moodScore !== null) {
              if (extracted.moodScore <= 3) {
                fireTrigger(user.id, AUTOMATION_TRIGGERS.MOOD_DROPPED, ctx).catch(() => {});
              } else if (extracted.moodScore >= 8) {
                fireTrigger(user.id, AUTOMATION_TRIGGERS.MOOD_SPIKED, ctx).catch(() => {});
              }
            }

            // person.mentioned — fire once per person
            for (const personName of (extracted.detectedPeople || [])) {
              fireTrigger(user.id, AUTOMATION_TRIGGERS.PERSON_MENTIONED, { ...ctx, personName }).catch(() => {});
            }

            // keyword.detected — check if any keywords from rules appear in the text
            // (The engine itself checks conditions; we just fire the trigger)
            fireTrigger(user.id, AUTOMATION_TRIGGERS.KEYWORD_DETECTED, { ...ctx, keyword: memoryText }).catch(() => {});
          }).catch(() => {});
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
  app.post("/api/memories/search", requireAuth, requireTier('pro'), aiLimiter, withSettings, async (req, res) => {
    try {
      const { queryText } = req.body;
      const user = req.user as User;
      
      if (!queryText || typeof queryText !== 'string') {
        return sendErrorResponse(res, 400, "queryText is required");
      }

      // Check if this is a financial query
      const userSettings = req.userSettings;
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

  // In-memory map: userId → last successful companion action timestamp
  const companionLastSeenMap = new Map<number, Date>();

  /**
   * GET /api/companion/status - Returns last-seen timestamp for the companion app
   * Used by the Settings card to show connection status
   */
  app.get("/api/companion/status", requireAuth, (req, res) => {
    const user = req.user as User;
    const lastSeenAt = companionLastSeenMap.get(user.id);
    res.json({ lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null });
  });

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

      // Track last-seen timestamp for companion app status card
      companionLastSeenMap.set(user.id, new Date());

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

  // ============================================================
  // Self-contained OAuth 2.0 routes for Google and Microsoft
  // ============================================================

  /**
   * GET /api/auth/google - Start Google OAuth flow (generates secure nonce)
   */
  app.get("/api/auth/google", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const redirectUri = `${proto}://${host}/api/auth/google/callback`;
      const nonce = await generateOauthState(user.id, 'google', redirectUri);
      const url = getGoogleAuthUrl(nonce, redirectUri);
      res.redirect(url);
    } catch (error: any) {
      console.error('[OAuth] Google start error:', error);
      res.redirect(`/settings?error=google_failed`);
    }
  });

  /**
   * GET /api/auth/google/callback - Google OAuth callback (validates nonce)
   */
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;

      if (error) {
        console.error('[OAuth] Google callback error:', error);
        return res.redirect('/settings?error=google_denied');
      }

      if (!code || !state) {
        return res.redirect('/settings?error=google_invalid');
      }

      // Validate nonce — throws if invalid/expired/tampered
      let userId: string;
      let redirectUri: string | null;
      try {
        ({ userId, redirectUri } = await validateOauthState(state, 'google'));
      } catch (e) {
        console.error('[OAuth] Google state validation failed:', e);
        return res.redirect('/settings?error=google_invalid');
      }

      // Fall back to building redirect URI from current request if not stored
      if (!redirectUri) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        redirectUri = `${proto}://${host}/api/auth/google/callback`;
      }

      try {
        await exchangeGoogleCode(userId, code, redirectUri);
      } catch (e) {
        console.error('[OAuth] Google code exchange failed:', e);
        return res.redirect('/settings?error=google_failed');
      }

      res.redirect('/settings?connected=google');
    } catch (error) {
      console.error('[OAuth] Google callback exception:', error);
      res.redirect('/settings?error=google_failed');
    }
  });

  /**
   * DELETE /api/auth/google - Disconnect Google account
   */
  app.delete("/api/auth/google", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      await deleteTokens(user.id, 'google');
      res.json({ status: 'success', message: 'Google account disconnected' });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to disconnect Google account", error);
    }
  });

  /**
   * GET /api/auth/microsoft - Start Microsoft OAuth flow (generates secure nonce)
   */
  app.get("/api/auth/microsoft", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const redirectUri = `${proto}://${host}/api/auth/microsoft/callback`;
      const nonce = await generateOauthState(user.id, 'microsoft', redirectUri);
      const url = getMicrosoftAuthUrl(nonce, redirectUri);
      res.redirect(url);
    } catch (error: any) {
      console.error('[OAuth] Microsoft start error:', error);
      res.redirect(`/settings?error=microsoft_failed`);
    }
  });

  /**
   * GET /api/auth/microsoft/callback - Microsoft OAuth callback (validates nonce)
   */
  app.get("/api/auth/microsoft/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;

      if (error) {
        console.error('[OAuth] Microsoft callback error:', error);
        return res.redirect('/settings?error=microsoft_denied');
      }

      if (!code || !state) {
        return res.redirect('/settings?error=microsoft_invalid');
      }

      // Validate nonce — throws if invalid/expired/tampered
      let userId: string;
      let redirectUri: string | null;
      try {
        ({ userId, redirectUri } = await validateOauthState(state, 'microsoft'));
      } catch (e) {
        console.error('[OAuth] Microsoft state validation failed:', e);
        return res.redirect('/settings?error=microsoft_invalid');
      }

      // Fall back to building redirect URI from current request if not stored
      if (!redirectUri) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        redirectUri = `${proto}://${host}/api/auth/microsoft/callback`;
      }

      try {
        await exchangeMicrosoftCode(userId, code, redirectUri);
      } catch (e) {
        console.error('[OAuth] Microsoft code exchange failed:', e);
        return res.redirect('/settings?error=microsoft_failed');
      }

      res.redirect('/settings?connected=microsoft');
    } catch (error) {
      console.error('[OAuth] Microsoft callback exception:', error);
      res.redirect('/settings?error=microsoft_failed');
    }
  });

  /**
   * DELETE /api/auth/microsoft - Disconnect Microsoft account
   */
  app.delete("/api/auth/microsoft", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      await deleteTokens(user.id, 'microsoft');
      res.json({ status: 'success', message: 'Microsoft account disconnected' });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to disconnect Microsoft account", error);
    }
  });

  /**
   * GET /api/auth/oauth/status - Get OAuth connection status + account emails
   */
  app.get("/api/auth/oauth/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const [googleConnected, microsoftConnected, googleEmail, microsoftEmail] = await Promise.all([
        hasValidToken(user.id, 'google'),
        hasValidToken(user.id, 'microsoft'),
        getAccountEmail(user.id, 'google'),
        getAccountEmail(user.id, 'microsoft'),
      ]);
      res.json({
        status: 'success',
        google: {
          connected: googleConnected,
          configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          accountEmail: googleConnected ? googleEmail : null,
        },
        microsoft: {
          connected: microsoftConnected,
          configured: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
          accountEmail: microsoftConnected ? microsoftEmail : null,
        },
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get OAuth status", error);
    }
  });

  /**
   * GET /api/calendar/status - Check if calendar is connected
   * Returns status for both Google and Outlook providers
   */
  app.get("/api/calendar/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const [googleConnected, outlookConnected] = await Promise.all([
        isGoogleCalendarConnected(user.id),
        isOutlookConnected(user.id)
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
      const user = req.user as User;
      const [gmailConnected, outlookConnected] = await Promise.all([
        isGmailConnected(user.id),
        isOutlookMailConnected(user.id)
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
        isGoogleCalendarConnected(user.id),
        isOutlookConnected(user.id),
        isGmailConnected(user.id),
        isOutlookMailConnected(user.id),
        storage.getSettings(user.id),
        getGmailCapabilities(user.id)
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
      const user = req.user as User;
      const events = await getTodaysEvents(user.id);
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
      const user = req.user as User;
      const event = await findRelevantEvent(new Date(), user.id);
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

      const user = req.user as User;
      // Check if calendar is connected
      const connected = await isCalendarConnected(user.id);
      if (!connected) {
        return sendErrorResponse(res, 400, "Google Calendar is not connected");
      }

      // Check for duplicate event
      const duplicate = await findDuplicateEvent(title, startDateTime, 30, user.id);
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
        userId: user.id,
      });

      if (!createdEvent) {
        return sendErrorResponse(res, 500, "Calendar event creation returned no result");
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

      const user = req.user as User;
      const duplicate = await findDuplicateEvent(title, startDateTime, 30, user.id);
      
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
   * GET /api/people/:id/messages - Get conversations & recent messages linked to a person
   * Matches by contactName (case-insensitive, name/aliases) or contactAddress (phone number)
   * Requires authentication
   */
  app.get("/api/people/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const person = await storage.getPersonById(user.id, req.params.id);
      if (!person) {
        return sendErrorResponse(res, 404, "Person not found");
      }

      // Build name variants for matching (name + all aliases, lowercased)
      const nameVariants = [person.name, ...(person.aliases || [])].map(n => n.toLowerCase().trim()).filter(Boolean);

      // Normalize phone number to digits only for loose matching
      const personPhoneDigits = person.phoneNumber ? person.phoneNumber.replace(/\D/g, '') : null;

      // Fetch all conversations to filter in memory (max 1000 — sufficient for any user)
      const allConversations = await storage.getMessageConversations(user.id, 1000, 0);

      const matchingConvs = allConversations.filter(conv => {
        // Match by phone number if available — require both sides to be meaningful length
        if (personPhoneDigits && personPhoneDigits.length >= 7) {
          const addrDigits = conv.contactAddress.replace(/\D/g, '');
          if (addrDigits.length >= 7 && (addrDigits.endsWith(personPhoneDigits) || personPhoneDigits.endsWith(addrDigits))) return true;
        }
        // Match by contactName — require ALL words of the name variant to appear in
        // the contact name to prevent partial/single-word false positives (e.g. "Michael"
        // from a business matching "Michael Nelson").
        if (conv.contactName) {
          const cn = conv.contactName.toLowerCase().trim();
          if (nameVariants.some(variant => {
            if (cn === variant) return true; // exact match
            const words = variant.split(/\s+/).filter(w => w.length > 2);
            if (words.length >= 2) {
              // Multi-word name: every word must appear in the contact name
              return words.every(w => cn.includes(w));
            }
            // Single-word alias: exact match only to avoid false positives
            return cn === variant;
          })) return true;
        }
        return false;
      });

      // For each matching conversation, fetch recent messages (capped to 50 total across all convs)
      const GLOBAL_MSG_CAP = 50;
      let remaining = GLOBAL_MSG_CAP;
      const results: Array<{ conversation: typeof matchingConvs[0]; messages: Awaited<ReturnType<typeof storage.getMessages>> }> = [];
      for (const conv of matchingConvs.slice(0, 10)) {
        if (remaining <= 0) break;
        const msgs = await storage.getMessages(user.id, conv.id, remaining, 0);
        results.push({ conversation: conv, messages: msgs });
        remaining -= msgs.length;
      }

      res.json({
        status: 'success',
        data: results,
        conversationCount: results.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch person messages", error);
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
  app.post("/api/insights", requireAuth, requireTier('pro'), aiLimiter, withSettings, async (req, res) => {
    try {
      const user = req.user as User;
      const validation = insightsQuerySchema.safeParse(req.body);
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      const { question, days } = validation.data;
      
      // Compute cutoff date for consistent scoping across all fetches
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Fetch everything in parallel — memories, goals, exact status counts, and title samples
      // Use dedicated count queries for accuracy regardless of action volume.
      const [
        memories,
        goals,
        completedCount, pendingCount, rejectedCount, failedCount,
        completedTitles, pendingTitles, rejectedTitles,
      ] = await Promise.all([
        storage.getRecentLogEntriesLight(user.id, days, 100),
        storage.getGoals(user.id),
        storage.getAiActionsCount(user.id, ['completed'], cutoffDate),
        storage.getAiActionsCount(user.id, ['pending'], cutoffDate),
        storage.getAiActionsCount(user.id, ['rejected'], cutoffDate),
        storage.getAiActionsCount(user.id, ['failed'], cutoffDate),
        storage.getAiActions(user.id, ['completed'], 5, 0, cutoffDate),
        storage.getAiActions(user.id, ['pending'], 5, 0, cutoffDate),
        storage.getAiActions(user.id, ['rejected'], 5, 0, cutoffDate),
      ]);
      
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
      
      // Build active goals context
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
      const userSettings = req.userSettings;
      const userTimezone = userSettings?.userTimezone || 'America/Denver';

      // Build AI Actions context — exact counts from dedicated queries + capped title samples
      const totalAiActions = completedCount + pendingCount + rejectedCount + failedCount;
      const aiActionsContext = {
        counts: {
          ...(completedCount > 0 && { completed: completedCount }),
          ...(pendingCount > 0 && { pending: pendingCount }),
          ...(rejectedCount > 0 && { rejected: rejectedCount }),
          ...(failedCount > 0 && { failed: failedCount }),
        },
        recentCompleted: completedTitles.map(a => a.title),
        recentPending: pendingTitles.map(a => a.title),
        recentRejected: rejectedTitles.map(a => a.title),
      };

      // Derive top people from detectedPeople arrays across memories
      const peopleFreq = new Map<string, number>();
      for (const m of filteredMemories) {
        const people = (m.detectedPeople as string[] | null) ?? [];
        for (const name of people) {
          if (name) peopleFreq.set(name, (peopleFreq.get(name) ?? 0) + 1);
        }
      }
      const topPeople = [...peopleFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => `${name} (${count} mentions)`);

      // Derive top locations from geoPlaceName
      const locationFreq = new Map<string, number>();
      for (const m of filteredMemories) {
        if (m.geoPlaceName) locationFreq.set(m.geoPlaceName, (locationFreq.get(m.geoPlaceName) ?? 0) + 1);
      }
      const topLocations = [...locationFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([place, count]) => `${place} (${count} entries)`);

      // Generate insights - filter and type-guard the light memories, now including importance
      const insights = await generateThematicInsights(
        filteredMemories
          .filter(m => m.memoryText && m.timestamp && m.topicTag)
          .map(m => ({
            memoryText: m.memoryText!,
            mood: m.mood || undefined,
            moodScore: m.moodScore || undefined,
            importance: m.importance ?? undefined,
            timestamp: m.timestamp!,
            topicTag: m.topicTag!,
          })),
        question,
        activeGoals.length > 0 ? activeGoals : undefined,
        userTimezone,
        userSettings?.sassLevel ?? 50,
        userSettings?.professionalMode ?? false,
        totalAiActions > 0 ? aiActionsContext : undefined,
        topPeople.length > 0 ? topPeople : undefined,
        topLocations.length > 0 ? topLocations : undefined,
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
  app.get("/api/briefing", requireAuth, requireTier('pro'), aiLimiter, withSettings, async (req, res) => {
    try {
      const user = req.user as User;
      const localHour = parseInt(req.query.localHour as string) || new Date().getHours();
      const forceRefresh = req.query.refresh === 'true';
      const queryTimezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;
      
      // Cache key based on user's LOCAL date (not UTC) to avoid wrong day boundary
      const settingsForCache = req.userSettings;
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
            const gmailConnected = await isGmailConnected(user.id);
            if (gmailConnected) {
              const gmailCaps = await getGmailCapabilities(user.id);
              if (gmailCaps.canRead) {
                const emails = await getRecentEmails(user.id, 10);
                const mapped = emails.map(e => ({ subject: e.subject, from: e.from, snippet: e.snippet, date: e.date }));
                if (mapped.length > 0) return { emails: mapped, source: 'gmail' };
              }
            }
          }
          if (!preferredEmailProvider || preferredEmailProvider === 'outlook') {
            const outlookConnected = await isOutlookMailConnected(user.id);
            if (outlookConnected) {
              const emails = await getOutlookRecentEmails(user.id, 10);
              const mapped = emails.map(e => ({ subject: e.subject, from: e.from, snippet: e.snippet, date: e.date }));
              if (mapped.length > 0) return { emails: mapped, source: 'outlook' };
            }
          }
        } catch (err) { console.warn('Briefing: email fetch failed:', err instanceof Error ? err.message : err); }
        return { emails: [], source: null };
      };
      
      const fetchFinancial = async (): Promise<{ totalSpending: number; totalIncome?: number; transactionCount: number; categoryBreakdown: Array<{ category: string; amount: number }>; topMerchants: Array<{ merchant: string; amount: number }> } | undefined> => {
        if (!shouldFetchFinancial) return undefined;
        try {
          const rawSummary = await plaidService.getSpendingSummary(user.id, 7);
          if (rawSummary && rawSummary.transactionCount > 0) {
            return {
              totalSpending: rawSummary.totalSpending,
              totalIncome: rawSummary.totalIncome,
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

      // Background: Send push notification if requested
      const sendPushNotif = req.query.sendPush === 'true';
      
      if (sendPushNotif) {
        setImmediate(async () => {
          try {
            if (isPushConfigured()) {
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

      // Background: Run proactive analysis after briefing is generated
      setImmediate(async () => {
        try {
          const { runProactiveAnalysis, generateBriefingActionProposals } = await import('./proactive-service');
          await Promise.allSettled([
            runProactiveAnalysis(user.id, userTimezone),
            generateBriefingActionProposals(user.id, {
              focusAreas: briefing.focusAreas,
              reminders: briefing.reminders,
              summary: briefing.summary,
            }),
          ]);
        } catch (err) {
          console.error('[briefing] Background proactive analysis failed (non-fatal):', err instanceof Error ? err.message : err);
        }
      });

      // Background: Fire briefing.generated automation trigger
      setImmediate(async () => {
        try {
          const { fireTrigger, AUTOMATION_TRIGGERS } = await import('./automation-engine');
          await fireTrigger(user.id, AUTOMATION_TRIGGERS.BRIEFING_GENERATED, {
            userId: user.id,
            briefingSummary: briefing?.summary || '',
          });
        } catch (err) {
          // Non-fatal
        }
      });

      // Background: Outbound relay — dispatch briefing summary to configured destinations
      if (briefing?.summary) {
        setImmediate(async () => {
          try {
            const { dispatchBriefingSummary } = await import('./relay-outbound-service');
            await dispatchBriefingSummary(
              user.id,
              briefing.summary,
              briefing.focusAreas
            );
          } catch (err) {
            // Non-fatal — relay failure must not affect briefing delivery
            console.warn('[briefing] Outbound relay dispatch failed:', err instanceof Error ? err.message : err);
          }
        });
      }

      // Background: Create insight.surface actions from pattern alerts
      setImmediate(async () => {
        try {
          if (recentMemories.length >= 5) {
            const { detectPatternAlerts } = await import('./ai-service');
            const { createInsightSurfaceActions } = await import('./proactive-service');
            const briefingTz = req.userSettings?.userTimezone || 'America/Denver';
            const alerts = await detectPatternAlerts(
              briefingMemories,
              briefingTz,
              req.userSettings?.sassLevel ?? undefined,
              req.userSettings?.professionalMode ?? undefined
            );
            if (alerts.length > 0) {
              await createInsightSurfaceActions(user.id, alerts);
            }
          }
        } catch (err) {
          console.error('[briefing] Background insight surfacing failed (non-fatal):', err instanceof Error ? err.message : err);
        }
      });
      
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
  app.get("/api/news-feed", requireAuth, requireTier('pro'), aiLimiter, withSettings, async (req, res) => {
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
      const [recentMemories, userPeople] = await Promise.all([
        storage.getRecentLogEntriesLight(user.id, 7, 100),
        storage.getPeople(user.id)
      ]);
      const userSettings = req.userSettings;
      
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
            const gmailConnected = await isGmailConnected(user.id);
            if (gmailConnected) {
              const emails = await getRecentEmails(user.id, 10);
              const mapped = emails.map((e: { subject: string; from: string; snippet: string; date: Date }) => ({
                subject: e.subject, from: e.from, snippet: e.snippet, date: e.date
              }));
              if (mapped.length > 0) return mapped;
            }
          }
          if (!preferredEmailProvider || preferredEmailProvider === 'outlook') {
            const outlookConnected = await isOutlookMailConnected(user.id);
            if (outlookConnected) {
              const emails = await getOutlookRecentEmails(user.id, 10);
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
          const calendarConnected = await isCalendarConnected(user.id);
          if (calendarConnected) {
            const events = await getUpcomingEvents(3, user.id);
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
      
      const fetchFinancial = async (): Promise<{ totalSpending: number; totalIncome?: number; transactionCount: number; categoryBreakdown: Array<{ category: string; amount: number }>; topMerchants: Array<{ merchant: string; amount: number }> } | undefined> => {
        if (!shouldFetchFinancial) return undefined;
        try {
          const rawSummary = await plaidService.getSpendingSummary(user.id, 7);
          if (rawSummary && rawSummary.transactionCount > 0) {
            return {
              totalSpending: rawSummary.totalSpending,
              totalIncome: rawSummary.totalIncome,
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
      // Only cache non-empty results for the full 30-minute TTL.
      // An empty stories array (transient AI failure, timeout) is cached for only
      // 3 minutes so the next request has a real chance of regenerating successfully.
      const hasStories = (newsFeed as PersonalNewsFeed).stories?.length > 0;
      await storage.setAiCache(user.id, 'newsfeed', cacheKey, newsFeed, memoriesHash, recentMemories.length, hasStories ? 30 : 3);

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
        const calendarConnected = await isCalendarConnected(user.id);
        if (calendarConnected) {
          const events = await getUpcomingEvents(14, user.id);
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
        const gmailConnected = await isGmailConnected(user.id);
        if (gmailConnected) {
          const capabilities = await getGmailCapabilities(user.id);
          if (capabilities.canRead) {
            const recentEmails = await getRecentEmails(user.id, 10);
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
        activeGoals.length > 0 ? activeGoals : undefined,
        userSettings?.userTimezone || 'America/Denver'
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

      // Background: Send push notification for high-signal alerts + companion people.note + outbound relay
      if (highSignalAlerts.length > 0) {
        setImmediate(async () => {
          try {
            if (isPushConfigured()) {
              const topAlert = highSignalAlerts[0];
              const alertMessage = formatHighSignalAlert(topAlert);
              await sendPushToAllUserDevices(user.id, {
                type: 'discovery',
                title: `🚨 ${topAlert.person.name} mentioned`,
                body: alertMessage.body.substring(0, 120),
                url: '/dashboard',
                requireInteraction: topAlert.person.priority >= 9,
              });
            }
            // Companion: create a people.note proposal for each alertable match
            const { createHighSignalCompanionProposals } = await import('./proactive-service');
            await createHighSignalCompanionProposals(
              user.id,
              highSignalAlerts.map((m) => ({
                person: { id: m.person.id, name: m.person.name, priority: m.person.priority, relationship: m.person.relationship },
                discovery: { id: m.discovery.id, title: m.discovery.title, url: m.discovery.url, content: m.discovery.content },
                confidence: m.confidence,
              }))
            );
            // Outbound relay: dispatch high-signal alert to configured external surfaces
            const { dispatchHighSignalAlert } = await import('./relay-outbound-service');
            for (const match of highSignalAlerts) {
              await dispatchHighSignalAlert(
                user.id,
                match.person.name,
                match.discovery.title,
                match.discovery.url,
                match.matchContext
              );
            }
          } catch (err) {
            console.error('High-signal push notification or companion error:', err);
          }
        });
      }

      // Background: Discovery → action bridge
      if (discoveries.discoveries.length > 0) {
        setImmediate(async () => {
          try {
            const { generateDiscoveryActionProposals } = await import('./proactive-service');
            await generateDiscoveryActionProposals(user.id, discoveries.discoveries);
          } catch (err) {
            console.error('[discoveries] Action proposal generation failed (non-fatal):', err instanceof Error ? err.message : err);
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
  app.get("/api/alerts", requireAuth, requireTier('pro'), aiLimiter, withSettings, async (req, res) => {
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
      const userSettings = req.userSettings;
      const userTimezone = queryTimezone || userSettings?.userTimezone || 'America/Denver';
      
      const alerts = await detectPatternAlerts(alertMemories, userTimezone, userSettings?.sassLevel ?? 50, userSettings?.professionalMode ?? false);

      // Cache the result (30 minute TTL)
      const memoriesHash = recentMemories.filter(m => m.id).map(m => m.id).join(',');
      await storage.setAiCache(user.id, 'alerts', cacheKey, alerts, memoriesHash, recentMemories.length, 30);

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

      // Background: Push notification only for positive/insight patterns — not negative.
      // Negative patterns are available in the app at the user's own pace; pushing them
      // feels like a scolding notification and creates a negative feedback loop.
      const pushableAlerts = alerts.filter(a => a.type === 'positive' || a.type === 'insight');
      if (pushableAlerts.length > 0) {
        setImmediate(async () => {
          try {
            if (isPushConfigured()) {
              const topAlert = pushableAlerts[0];
              if (topAlert) {
                const result = await sendPushToAllUserDevices(user.id, {
                  type: 'alert',
                  title: `💡 Keryx noticed something`,
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
   * GET /api/ecosystem/stats - Aggregate life dashboard data
   * Returns mood trend, topic frequency, memories/day, people, goals, financial, reminders, AI actions.
   * Cached 5 minutes per user (in-memory keyed by userId+timezone+days).
   */
  interface EcosystemPayload {
    period: { days: number; timezone: string };
    systemHealth: {
      totalMemories: number;
      activeReminders: number;
      pendingActions: number;
      patternAlerts: { positive: number; negative: number; insight: number; neutral: number };
    };
    memoryPulse: {
      perDay: { date: string; count: number }[];
      total7Days: number;
      velocityDeltaPct: number | null;
    };
    moodTrend: {
      trend: { date: string; avgScore: number; count: number }[];
      recentAvg: number | null;
      trendDir: 'up' | 'down' | 'flat';
    };
    topicDistribution: { topic: string; count: number }[];
    relationshipHealth: { name: string; mentionCount: number; velocityTier: string }[];
    goalProgress: {
      id: string;
      title: string;
      status: string;
      progress: number;
      milestones: GoalMilestone[];
      aiSummary: string | null;
    }[];
    financial: {
      connected: boolean;
      totalSpending?: number;
      totalIncome?: number;
      transactionCount?: number;
      categoryBreakdown?: { category: string; amount: number }[];
    };
    captions: EcosystemCaptions;
    generatedAt: string;
    cached: boolean;
  }

  const ecosystemCache = new Map<string, { data: EcosystemPayload; expiresAt: number }>();

  app.get("/api/ecosystem/stats", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      const timezone = (typeof req.query.timezone === 'string' ? req.query.timezone : undefined)
        || 'America/Denver';
      const days = parseInt(req.query.days as string) || 30;
      const forceRefresh = req.query.refresh === 'true';

      const cacheKey = `${user.id}:${timezone}:${days}`;
      if (!forceRefresh) {
        const cached = ecosystemCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.json({ ...cached.data, cached: true });
        }
      }

      const userTier = user.subscriptionTier || 'free';
      const hasLifeOS = userTier === 'life_os';

      const userSettings = await storage.getSettings(user.id);
      const sassLevel = userSettings?.sassLevel ?? 50;
      const professionalMode = userSettings?.professionalMode ?? false;

      const [
        moodTrendResult,
        topicFrequencyResult,
        memoriesPerDayResult,
        allPeopleResult,
        activeGoalsResult,
        pendingRemindersResult,
        pendingActionsResult,
        totalMemoriesResult,
        financialResult,
        cachedAlertsResult,
      ] = await Promise.allSettled([
        storage.getMoodTrend(user.id, days, timezone),
        storage.getTopicFrequency(user.id, days),
        storage.getMemoriesPerDay(user.id, days, timezone),
        storage.getPeople(user.id),
        storage.getGoals(user.id, 'active'),
        storage.getReminders(user.id, 'pending'),
        storage.getPendingActions(user.id),
        storage.getLogEntriesCount(user.id),
        hasLifeOS ? plaidService.getSpendingSummary(user.id, days) : Promise.resolve(null),
        storage.getAiCache(user.id, 'alerts', 'days-14'),
      ]);

      const mood = moodTrendResult.status === 'fulfilled' ? moodTrendResult.value : [];
      const topics = topicFrequencyResult.status === 'fulfilled' ? topicFrequencyResult.value : [];
      const memPerDay = memoriesPerDayResult.status === 'fulfilled' ? memoriesPerDayResult.value : [];
      const rawPeople = allPeopleResult.status === 'fulfilled' ? allPeopleResult.value : [] as Person[];
      const people = rawPeople.slice(0, 8);
      const goals = activeGoalsResult.status === 'fulfilled' ? activeGoalsResult.value : [] as Goal[];
      const reminders = pendingRemindersResult.status === 'fulfilled' ? pendingRemindersResult.value : [];
      const actions = pendingActionsResult.status === 'fulfilled' ? pendingActionsResult.value : [];
      const total = totalMemoriesResult.status === 'fulfilled' ? totalMemoriesResult.value : 0;
      const financialRaw = financialResult.status === 'fulfilled' ? financialResult.value : null;
      const cachedAlerts = cachedAlertsResult.status === 'fulfilled' ? cachedAlertsResult.value : null;

      // Compute memory KPIs
      const last7 = memPerDay.slice(-7).reduce((s, d) => s + d.count, 0);
      const prev7 = memPerDay.slice(-14, -7).reduce((s, d) => s + d.count, 0);
      const velocityDelta = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

      // Compute mood KPIs
      const recentMoodSlice = mood.slice(-7);
      const recentMoodAvg = recentMoodSlice.length > 0
        ? Math.round(recentMoodSlice.reduce((s, d) => s + d.avgScore, 0) / recentMoodSlice.length)
        : null;
      const prevMoodSlice = mood.slice(-14, -7);
      const prevMoodAvg = prevMoodSlice.length > 0
        ? Math.round(prevMoodSlice.reduce((s, d) => s + d.avgScore, 0) / prevMoodSlice.length)
        : null;
      let moodTrendDir: 'up' | 'down' | 'flat' = 'flat';
      if (recentMoodAvg !== null && prevMoodAvg !== null) {
        if (recentMoodAvg - prevMoodAvg > 5) moodTrendDir = 'up';
        else if (prevMoodAvg - recentMoodAvg > 5) moodTrendDir = 'down';
      }

      // Pattern alert sentiment breakdown from cached alerts data
      const patternAlerts = { positive: 0, negative: 0, insight: 0, neutral: 0 };
      if (cachedAlerts?.data && Array.isArray(cachedAlerts.data)) {
        for (const alert of cachedAlerts.data as { type: string }[]) {
          if (alert.type === 'positive') patternAlerts.positive++;
          else if (alert.type === 'negative') patternAlerts.negative++;
          else if (alert.type === 'insight') patternAlerts.insight++;
          else patternAlerts.neutral++;
        }
      }

      // Goal avg progress — use progressPercent (the actual DB column)
      const avgGoalProgress = goals.length > 0
        ? Math.round(goals.reduce((s, g) => s + (g.progressPercent ?? 0), 0) / goals.length)
        : 0;

      // Build captions in parallel with response prep (fire-and-forget if slow, use defaults)
      const captions = await generateEcosystemCaptions({
        totalMemories: total,
        velocityDeltaPct: velocityDelta,
        moodRecentAvg: recentMoodAvg,
        moodTrendDir,
        topTopics: topics.slice(0, 3).map(t => t.topic),
        topPerson: people[0]?.name ?? null,
        peopleCount: rawPeople.length,
        activeGoals: goals.length,
        avgGoalProgress,
        financialConnected: !!financialRaw,
        totalSpending: financialRaw?.totalSpending ?? 0,
      }, sassLevel, professionalMode).catch(() => ({
        memoryPulse: "Memory velocity logged.",
        moodTrend: "Mood trend recorded.",
        topicDistribution: "Topic breakdown ready.",
        relationshipHealth: "People tracked.",
        goalProgress: "Goal status updated.",
        financial: financialRaw ? "Spending data available." : "Connect Plaid to see spending.",
      }));

      const payload: EcosystemPayload = {
        period: { days, timezone },
        systemHealth: {
          totalMemories: total,
          activeReminders: reminders.length,
          pendingActions: actions.length,
          patternAlerts,
        },
        memoryPulse: {
          perDay: memPerDay,
          total7Days: last7,
          velocityDeltaPct: velocityDelta,
        },
        moodTrend: {
          trend: mood,
          recentAvg: recentMoodAvg,
          trendDir: moodTrendDir,
        },
        topicDistribution: topics.slice(0, 8),
        relationshipHealth: people.map((p) => ({
          name: p.name,
          mentionCount: p.mentionCount ?? 0,
          velocityTier: p.velocityTier ?? 'acquaintance',
          relationship: p.relationship ?? 'acquaintance',
        })),
        goalProgress: goals.map((g) => ({
          id: g.id,
          title: g.title,
          status: g.status,
          progress: g.progressPercent ?? 0,
          milestones: (Array.isArray(g.milestones) ? g.milestones : []) as GoalMilestone[],
          aiSummary: g.aiSummary ?? null,
        })),
        financial: financialRaw ? {
          connected: true,
          totalSpending: financialRaw.totalSpending,
          totalIncome: financialRaw.totalIncome,
          transactionCount: financialRaw.transactionCount,
          categoryBreakdown: financialRaw.categoryBreakdown,
        } : { connected: false },
        captions,
        generatedAt: new Date().toISOString(),
        cached: false,
      };

      ecosystemCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 5 * 60 * 1000 });
      return res.json(payload);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch ecosystem stats", error);
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
          const calendarConnected = includeCalendar ? await isCalendarConnected(user.id) : false;
          
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
                  const relevantEvent = await findRelevantEvent(entry.timestamp, user.id);
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
   * GET /api/actions - Get user's AI actions with optional status filter, pagination, and date filter
   */
  app.get("/api/actions", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const statusFilter = req.query.status 
        ? (req.query.status as string).split(',') 
        : undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      
      // Server-side date filtering: 'today' | '7d' | '30d' | 'all'
      let since: Date | undefined;
      const range = req.query.range as string;
      if (range && range !== 'all') {
        since = new Date();
        if (range === 'today') {
          since.setHours(0, 0, 0, 0);
        } else if (range === '7d') {
          since.setDate(since.getDate() - 7);
          since.setHours(0, 0, 0, 0);
        } else if (range === '30d') {
          since.setDate(since.getDate() - 30);
          since.setHours(0, 0, 0, 0);
        }
      }
      
      const [actions, total] = await Promise.all([
        storage.getAiActions(user.id, statusFilter, limit, offset, since),
        storage.getAiActionsCount(user.id, statusFilter, since),
      ]);
      
      res.json({
        status: 'success',
        data: actions,
        count: actions.length,
        total,
        offset,
        limit,
        hasMore: offset + actions.length < total,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch actions", error);
    }
  });

  /**
   * GET /api/actions/stats - Summary stats for Agent Activity dashboard
   * NOTE: Must be defined BEFORE /api/actions/:id
   */
  app.get("/api/actions/stats", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [
        pending,
        completedTotal,
        completedToday,
        failedTotal,
        failedToday,
        rejectedTotal,
        rejectedToday,
        totalActions,
      ] = await Promise.all([
        storage.getPendingActions(user.id),
        storage.getAiActionsCount(user.id, ['completed']),
        storage.getAiActionsCount(user.id, ['completed'], today),
        storage.getAiActionsCount(user.id, ['failed']),
        storage.getAiActionsCount(user.id, ['failed'], today),
        storage.getAiActionsCount(user.id, ['rejected']),
        storage.getAiActionsCount(user.id, ['rejected'], today),
        storage.getAiActionsCount(user.id),
      ]);
      
      // Category breakdown of pending actions
      const categoryBreakdown: Record<string, number> = {};
      for (const a of pending) {
        categoryBreakdown[a.actionCategory] = (categoryBreakdown[a.actionCategory] || 0) + 1;
      }
      res.json({
        status: 'success',
        data: {
          pendingCount: pending.length,
          completedToday,
          completedTotal,
          failedToday,
          failedTotal,
          rejectedToday,
          rejectedTotal,
          totalActions,
          categoryBreakdown,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch action stats", error);
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
      const user = req.user as User;
      const actionTypes = await getAvailableActionTypes(user.id);
      
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

      // Fetch the action before executing so we can recover _automationChainDepth if present
      const pendingAction = await storage.getAiAction(req.params.id, user.id);
      
      const result = await approveAction(req.params.id, user.id);
      
      if (!result.success) {
        return res.status(400).json({
          status: 'error',
          message: result.errorMessage,
          timestamp: new Date().toISOString()
        });
      }

      // Fire action.completed trigger — if this action was created by an automation rule via
      // CREATE_AI_ACTION, recover the chain depth stored in payload._automationChainDepth so
      // the depth limit is properly enforced across the async approval boundary.
      if (pendingAction) {
        const storedPayload = pendingAction.payload as Record<string, unknown> | null ?? {};
        const rawDepth = storedPayload._automationChainDepth;
        // Validate: must be a non-negative finite integer bounded by MAX_CHAIN_DEPTH
        const recoveredDepth = (typeof rawDepth === 'number' && Number.isFinite(rawDepth) && rawDepth >= 0 && rawDepth <= 10)
          ? Math.floor(rawDepth)
          : 0;
        import('./automation-engine').then(({ fireTrigger, AUTOMATION_TRIGGERS }) => {
          fireTrigger(user.id, AUTOMATION_TRIGGERS.ACTION_COMPLETED, {
            userId: user.id,
            actionId: req.params.id,
            actionType: pendingAction.actionType,
            chainDepth: recoveredDepth,
          }).catch(() => {});
        }).catch(() => {});
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
   * POST /api/actions/:id/rollback - Roll back a completed action
   * Executes compensating actions based on rollbackData, then marks rolledBackAt.
   */
  app.post("/api/actions/:id/rollback", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const action = await storage.getAiAction(req.params.id, user.id);

      if (!action) {
        return sendErrorResponse(res, 404, "Action not found");
      }
      if (action.status !== 'completed') {
        return sendErrorResponse(res, 400, "Only completed actions can be rolled back");
      }
      if (!action.rollbackAvailable) {
        return sendErrorResponse(res, 400, "This action does not support rollback");
      }
      if (action.rolledBackAt) {
        return sendErrorResponse(res, 400, "Action has already been rolled back");
      }

      // Execute compensating actions before marking rolled back.
      // Only set rolledBackAt after compensation succeeds (or is best-effort for unknown types).
      let compensationNote: string = 'Action rolled back';
      
      if (action.rollbackData) {
        const rd = action.rollbackData as Record<string, unknown>;
        
        if (action.actionType === 'calendar.create' && rd.action === 'delete' && rd.eventId) {
          // Delete the created calendar event (provider-aware) — must succeed before marking rolled back
          const provider = (rd.provider as string) || 'google';
          if (provider === 'outlook') {
            const { deleteOutlookCalendarEvent } = await import('./outlook-calendar-service.js');
            await deleteOutlookCalendarEvent(String(rd.eventId), user.id);
          } else {
            const { deleteCalendarEventById } = await import('./ai-actions-service.js');
            await deleteCalendarEventById(String(rd.eventId), user.id);
          }
          compensationNote = `Calendar event deleted (id: ${rd.eventId}, provider: ${provider})`;
        } else if (action.actionType === 'log.create' && rd.entryId) {
          // Delete the created log entry — must succeed before marking rolled back
          await storage.deleteLogEntry(String(rd.entryId), user.id);
          compensationNote = `Memory entry removed (id: ${rd.entryId})`;
        } else {
          // For other action types: best-effort, note manual verification needed
          compensationNote = `Rollback recorded. Manual verification may be needed for action type: ${action.actionType}`;
        }
      }

      // Mark as rolled back only after compensation has completed
      await storage.markActionRolledBack(action.id, user.id);

      res.json({
        status: 'success',
        message: compensationNote,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to roll back action", error);
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
      
      const userSettings = await storage.getSettings(user.id);
      const result = await processUserInputForActions(user.id, userInput, 'manual', undefined, { timezone, userProfile: userSettings?.userProfile });
      
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
  app.post("/api/goals/:id/analyze", requireAuth, withSettings, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const goal = await storage.getGoal(req.params.id, user.id);
      if (!goal) {
        return sendErrorResponse(res, 404, "Goal not found");
      }
      
      // Get recent memories to analyze for progress
      const recentMemoriesRaw = await storage.getRecentLogEntriesLight(user.id, 30, 100);
      const recentMemories = recentMemoriesRaw
        .filter(m => m.memoryText)
        .map(m => ({ id: m.id, memoryText: m.memoryText!, timestamp: m.timestamp, topicTag: m.topicTag }));
      
      // Call AI to analyze progress (use settings cached by withSettings middleware)
      const analysis = await analyzeGoalProgress({
        ...goal,
        milestones: (Array.isArray(goal.milestones) ? goal.milestones : []) as MilestoneJSON[],
      }, recentMemories, req.userSettings?.sassLevel ?? 50, req.userSettings?.professionalMode ?? false);
      
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
  app.post("/api/goals/:id/suggest-milestones", requireAuth, withSettings, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const goal = await storage.getGoal(req.params.id, user.id);
      if (!goal) {
        return sendErrorResponse(res, 404, "Goal not found");
      }
      
      const suggestions = await suggestGoalMilestones({
        ...goal,
        milestones: (Array.isArray(goal.milestones) ? goal.milestones : []) as MilestoneJSON[],
      }, req.userSettings?.sassLevel ?? 50, req.userSettings?.professionalMode ?? false);
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

  // Deduplicate frequent places (merge nearby duplicates within 200m)
  app.post("/api/locations/places/deduplicate", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const result = await storage.deduplicateFrequentPlaces(user.id);
      res.json({ success: true, ...result });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to deduplicate places", error);
    }
  });

  // AI-name unnamed frequent places using OpenAI
  app.post("/api/locations/places/ai-name", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const places = await storage.getFrequentPlaces(user.id);

      // Only process unhidden, unlabeled/generic places without a confirmed custom name
      const toName = places.filter(p =>
        !p.isHidden &&
        !p.isConfirmed &&
        (!p.label || ['home', 'work'].includes(p.label) === false) &&
        /^Location \d+$/.test(p.name)
      );

      if (toName.length === 0) {
        return res.json({ success: true, named: 0, message: "No unnamed places to process" });
      }

      const { openai } = await import('./ai-service.js');
      const placeDescriptions = toName.map((p, i) => {
        const parts: string[] = [];
        parts.push(`[${i + 1}] ID: ${p.id}`);
        if (p.address) parts.push(`Address: ${p.address}`);
        else parts.push(`Coordinates: ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`);
        parts.push(`Visits: ${p.visitCount ?? 0}`);
        if (p.typicalDays && p.typicalDays.length > 0) parts.push(`Typical days: ${p.typicalDays.join(', ')}`);
        if (p.averageVisitMinutes) parts.push(`Avg stay: ${Math.round(p.averageVisitMinutes)} min`);
        return parts.join(' | ');
      }).join('\n');

      const aiRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a location naming assistant. Given a list of frequently visited locations, suggest a short, descriptive, human-friendly name for each one (2-4 words max). Names should reflect what the place likely is based on address, visit frequency, and timing patterns (e.g. "Coffee Shop", "Grocery Store", "Kids School", "Dog Park", "Friend's House"). Return ONLY valid JSON: an array of objects with "id" and "name" fields, one per location, in the same order as the input.`
          },
          {
            role: 'user',
            content: `Name these locations:\n${placeDescriptions}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const raw = aiRes.choices[0]?.message?.content || '{}';
      let suggestions: Array<{ id: string; name: string }> = [];
      try {
        const parsed = JSON.parse(raw);
        suggestions = Array.isArray(parsed) ? parsed : (parsed.locations ?? parsed.places ?? parsed.results ?? []);
      } catch {
        return res.json({ success: false, message: "AI response could not be parsed" });
      }

      let namedCount = 0;
      for (const s of suggestions) {
        if (!s.id || !s.name) continue;
        // Verify this place belongs to the user
        const place = toName.find(p => p.id === s.id);
        if (!place) continue;
        await storage.updateFrequentPlace(s.id, user.id, { name: s.name.trim() });
        namedCount++;
      }

      res.json({ success: true, named: namedCount });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to AI-name places", error);
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

  app.delete("/api/messages/conversations/:id/relay-messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const conversation = await storage.getMessageConversation(req.params.id, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      const deleted = await storage.deleteConversationRelayMessages(user.id, req.params.id);
      res.json({ deleted, message: `Removed ${deleted} relay message${deleted !== 1 ? 's' : ''}` });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to clear relay messages", error);
    }
  });

  app.delete("/api/messages/conversations/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const conversation = await storage.getMessageConversation(req.params.id, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      const ok = await storage.deleteConversation(user.id, req.params.id);
      res.json({ ok, message: "Conversation deleted" });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete conversation", error);
    }
  });

  app.post("/api/messages/conversations/merge", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const schema = z.object({
        targetId: z.string().uuid(),
        sourceIds: z.array(z.string().uuid()).min(1).max(50),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.issues });
      }
      const { targetId, sourceIds } = parsed.data;

      // Guard: targetId cannot appear in sourceIds
      if (sourceIds.includes(targetId)) {
        return res.status(400).json({ message: "Target conversation cannot also be a source" });
      }

      // Enforce same-platform constraint: all conversations being merged must share
      // the same platform (e.g. all 'sms'). Cross-platform merges are out of scope.
      const allIds = [targetId, ...sourceIds];
      const convs = await Promise.all(
        allIds.map(id => storage.getMessageConversation(id, user.id))
      );
      const missing = convs.findIndex(c => !c);
      if (missing !== -1) {
        return res.status(404).json({ message: "One or more conversations not found" });
      }
      const platforms = new Set(convs.map(c => c!.platform));
      if (platforms.size > 1) {
        return res.status(400).json({ message: "All conversations must be on the same platform to merge" });
      }

      const result = await storage.mergeConversations(user.id, targetId, sourceIds);
      const target = await storage.getMessageConversation(targetId, user.id);

      res.json({
        ok: true,
        message: `Merged ${result.merged} conversation(s), moved ${result.movedMessages} message(s)`,
        merged: result.merged,
        movedMessages: result.movedMessages,
        conversation: target,
      });
    } catch (error: any) {
      if (error?.message?.includes('not found or not owned')) {
        return res.status(403).json({ message: "One or more conversations not found" });
      }
      sendErrorResponse(res, 500, "Failed to merge conversations", error);
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
      const isFoundingMember = !!user.earlyAdopterAt && user.subscriptionTier !== 'free';
      const memoriesLimit = user.subscriptionTier === 'free' ? 100 : null;
      const paidCount = await storage.countFoundingMembers();
      const spotsRemaining = Math.max(0, 50 - paidCount);
      res.json({
        tier: user.subscriptionTier,
        status: user.subscriptionStatus,
        memoriesThisMonth: user.memoriesThisMonth || 0,
        memoriesLimit,
        currentPeriodEnd: user.currentPeriodEnd || null,
        isFoundingMember,
        stripeCustomerId: user.stripeCustomerId || null,
        stripeSubscriptionId: user.stripeSubscriptionId || null,
        stripeConfigured: isStripeConfigured(),
        enforcementActive: process.env.BILLING_ENFORCEMENT === 'true',
        earlyAdopterAt: user.earlyAdopterAt || null,
        spotsRemaining,
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
   * POST /api/billing/early-adopter - Join the early adopter interest list (no payment)
   * Marks earlyAdopterAt timestamp if not already set.
   */
  app.post("/api/billing/early-adopter", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (user.earlyAdopterAt) {
        return res.json({ status: 'already_joined', earlyAdopterAt: user.earlyAdopterAt });
      }
      const updated = await storage.updateUser(user.id, { earlyAdopterAt: new Date() });
      res.json({ status: 'joined', earlyAdopterAt: updated.earlyAdopterAt });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to join early adopter list", error);
    }
  });

  /**
   * GET /api/admin/founder-stats - Founder dashboard stats (owner only)
   * Returns aggregate counts + recent signups table.
   */
  app.get("/api/admin/founder-stats", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const ADMIN_USERNAME = 'merrillnelson@gmail.com';
      if (user.username?.toLowerCase() !== ADMIN_USERNAME) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { db: dbConn } = await import('./db');
      const { users: usersTable } = await import('@shared/schema');
      const { sql: sqlFn } = await import('drizzle-orm');

      const [totals] = await dbConn
        .select({
          total: sqlFn<number>`count(*)::int`,
          freeCount: sqlFn<number>`count(*) filter (where subscription_tier = 'free')::int`,
          proCount: sqlFn<number>`count(*) filter (where subscription_tier = 'pro')::int`,
          lifeOsCount: sqlFn<number>`count(*) filter (where subscription_tier = 'life_os')::int`,
          paidFounders: sqlFn<number>`count(*) filter (where stripe_subscription_id is not null)::int`,
          waitlistCount: sqlFn<number>`count(*) filter (where early_adopter_at is not null)::int`,
          testAccounts: sqlFn<number>`count(*) filter (where username like 'test%' or username like 'e2e%' or username like 'user-%' or username like 'user_%' or username like '%_test%')::int`,
        })
        .from(usersTable);

      const recentUsers = await dbConn
        .select({
          username: usersTable.username,
          subscriptionTier: usersTable.subscriptionTier,
          subscriptionStatus: usersTable.subscriptionStatus,
          stripeCustomerId: usersTable.stripeCustomerId,
          stripeSubscriptionId: usersTable.stripeSubscriptionId,
          earlyAdopterAt: usersTable.earlyAdopterAt,
          currentPeriodEnd: usersTable.currentPeriodEnd,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .orderBy(sqlFn`created_at desc`)
        .limit(50);

      const FOUNDING_SPOTS = 50;
      const paidFounders = totals?.paidFounders ?? 0;
      const spotsRemaining = Math.max(0, FOUNDING_SPOTS - paidFounders);

      res.json({
        status: 'success',
        totals: {
          total: totals?.total ?? 0,
          freeCount: totals?.freeCount ?? 0,
          proCount: totals?.proCount ?? 0,
          lifeOsCount: totals?.lifeOsCount ?? 0,
          paidFounders,
          waitlistCount: totals?.waitlistCount ?? 0,
          testAccounts: totals?.testAccounts ?? 0,
        },
        spotsRemaining,
        foundingSpots: FOUNDING_SPOTS,
        recentUsers,
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to get founder stats", error);
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

  // ── Relay API ────────────────────────────────────────────────────────────────
  // Universal inbound gateway — accepts SMS, commands, and events from any
  // authenticated external source (Android service, Meta glasses, Chrome extension).

  // ── Relay API helpers ────────────────────────────────────────────────────

  function normalizePhoneForRelay(phone: string): string {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits;
  }

  /** Zod schema for the outer relay envelope — shared by inbound + test routes. */
  const relayEnvelopeSchema = z.object({
    type: z.enum(['sms', 'command', 'event']),
    source: z.string().max(200).optional(),
  }).catchall(z.any());

  /**
   * Shared processing logic for relay payloads.
   * Both /api/relay/inbound (API-key auth) and /api/relay/test (session auth) call this.
   * @param isTest  true → prefix externalId with "relay_test_" and report duplicates
   */
  async function executeRelayPayload(
    userId: string,
    type: string,
    source: string | undefined,
    rest: Record<string, any>,
    isTest: boolean,
  ): Promise<{ routedTo: string[] }> {
    const routedTo: string[] = [];

    // ── SMS: store as a message and AI-process ───────────────────────────
    if (type === 'sms') {
      const { address, body, direction = 'received', timestamp, name } = rest;
      if (!address || !body) {
        const err: any = new Error('sms requires address and body');
        err.statusCode = 400;
        throw err;
      }

      // Normalize phone numbers (strip formatting, add country code) but
      // preserve alphanumeric thread IDs (e.g. Google Messages thread IDs like
      // "CgIEBISNZ7-gFRiCNTk") verbatim — normalizePhoneForRelay strips letters,
      // which would mangle or empty a thread ID entirely.
      const normalizedAddress = /[a-zA-Z]/.test(address)
        ? address          // thread ID — keep verbatim
        : normalizePhoneForRelay(address); // phone number — normalize
      const ts = timestamp ? new Date(timestamp) : new Date();
      // Content-based externalId: same physical message always produces the same key
      // regardless of when it is processed. Bucket by hour so the same text sent
      // 2+ hours apart is treated as a new message, but rapid duplicates are dropped.
      const hourBucket = Math.floor(ts.getTime() / (1000 * 60 * 60));
      const bodySlug = body.trim().slice(0, 80).replace(/\s+/g, ' ');
      const prefix = isTest ? 'relay_test' : 'relay';
      const externalId = `${prefix}_${normalizedAddress}_${direction}_${hourBucket}_${bodySlug}`;

      // name is the human-readable contact label sent by the extension when the
      // Google Messages DOM header is readable (e.g. "Michael Nelson").
      // It is stored as contactName so conversations display a real name rather
      // than a raw thread ID.  The upsert preserves existing names when null.
      const contactName = (name && typeof name === 'string' && name.trim()) ? name.trim() : null;

      const exists = await storage.messageExistsByExternalId(userId, externalId, 'live_relay');
      if (!exists) {
        const conversation = await storage.upsertMessageConversation({
          userId,
          contactAddress: normalizedAddress,
          contactName,
          platform: 'sms',
          threadId: null,
          lastMessageAt: ts,
          messageCount: 1,
          unprocessedCount: 1,
        });

        await storage.createMessagesBatch([{
          userId,
          conversationId: conversation.id,
          externalId,
          source: 'live_relay',
          direction,
          senderAddress: direction === 'received' ? normalizedAddress : null,
          senderName: null,
          body: body.trim(),
          messageType: 'sms',
          timestamp: ts,
          aiProcessed: false,
          importBatchId: null,
          rawMetadata: { relaySource: source || 'relay' },
        }]);

        setImmediate(async () => {
          try {
            const unprocessed = await storage.getUnprocessedMessages(userId);
            if (unprocessed.length > 0) await processMessageBatch(userId, unprocessed);
          } catch (e) {
            console.error('[relay] AI processing error:', e);
          }
        });

        routedTo.push('keryx');
      } else if (isTest) {
        routedTo.push('keryx (duplicate — skipped)');
      }
    }

    // ── Fan-out to configured destinations ──────────────────────────────
    const destinations = await storage.getRelayDestinations(userId);
    const enabledDests = destinations.filter(d => {
      if (!d.enabled) return false;
      if (!d.payloadTypeFilter || d.payloadTypeFilter.length === 0) return true;
      return d.payloadTypeFilter.includes(type);
    });

    await Promise.allSettled(
      enabledDests.map(async (dest) => {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          // Note: dest.apiKey stored plaintext — future work: encrypt at rest
          if (dest.apiKey) headers['X-API-Key'] = dest.apiKey;
          const response = await fetch(dest.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type, source, ...rest }),
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) routedTo.push(dest.label);
        } catch (e) {
          console.warn(`[relay] Failed to forward to ${dest.label}:`, e);
        }
      })
    );

    await storage.createRelayEvent({
      userId,
      type,
      source: source || null,
      payload: { ...rest },
      routedTo,
    });

    return { routedTo };
  }

  /** Middleware: resolve user from X-API-Key header (no session required). */
  async function requireApiKey(req: any, res: Response, next: any) {
    const key = req.headers['x-api-key'] as string | undefined;
    if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' });
    const user = await storage.getUserByRelayApiKey(key);
    if (!user) return res.status(401).json({ error: 'Invalid API key' });
    req.relayUser = user;
    next();
  }

  /** GET /api/relay/key — return (or auto-generate) the relay API key. Session auth. */
  app.get("/api/relay/key", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      let s = await storage.getSettings(user.id);
      if (!s?.relayApiKey) {
        const key = `rky_${randomUUID().replace(/-/g, '')}`;
        s = await storage.updateSettings(user.id, { relayApiKey: key });
      }
      const host = `${req.protocol}://${req.get('host')}`;
      res.json({
        apiKey: s!.relayApiKey,
        endpoint: `${host}/api/relay/inbound`,
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch relay key", error);
    }
  });

  /** POST /api/relay/key/regenerate — issue a fresh API key. Session auth. */
  app.post("/api/relay/key/regenerate", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const key = `rky_${randomUUID().replace(/-/g, '')}`;
      await storage.updateSettings(user.id, { relayApiKey: key });
      res.json({ apiKey: key });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to regenerate relay key", error);
    }
  });

  /**
   * POST /api/relay/inbound — the universal entry point.
   * Auth: X-API-Key header (no session cookie required).
   * Body: { type: 'sms'|'command'|'event', source?: string, ...typeFields }
   *   sms:     { address, body, direction?: 'sent'|'received', timestamp? }
   *   command: { intent, parameters? }
   *   event:   { payload }  (arbitrary JSON)
   */
  app.post("/api/relay/inbound", relayInboundLimiter, requireApiKey, async (req: any, res) => {
    try {
      const parsed = relayEnvelopeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid payload' });
      }
      const { type, source, ...rest } = parsed.data as { type: string; source?: string; [k: string]: any };
      const user = req.relayUser as User;
      const { routedTo } = await executeRelayPayload(user.id, type, source, rest, false);
      res.json({ received: true, type, routed_to: routedTo });
    } catch (error: any) {
      if (error?.statusCode === 400) return res.status(400).json({ error: error.message });
      sendErrorResponse(res, 500, "Relay inbound failed", error);
    }
  });

  /** GET /api/relay/destinations */
  app.get("/api/relay/destinations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const dests = await storage.getRelayDestinations(user.id);
      res.json(dests);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch destinations", error);
    }
  });

  /** POST /api/relay/destinations */
  app.post("/api/relay/destinations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const schema = z.object({
        label: z.string().min(1).max(100),
        url: z.string().url(),
        apiKey: z.string().optional(),
        payloadTypeFilter: z.array(z.enum(['sms', 'command', 'event'])).optional(),
        enabled: z.boolean().default(true),
      });
      const data = schema.parse(req.body);
      const dest = await storage.createRelayDestination({ userId: user.id, ...data });
      res.json(dest);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create destination", error);
    }
  });

  /** PUT /api/relay/destinations/:id */
  app.put("/api/relay/destinations/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      // Reuse the canonical insert schema (partial), then override outboundFormat with strict enum validation
      const baseSchema = insertRelayDestinationSchema.partial().omit({ userId: true });
      const strictSchema = baseSchema.extend({
        outboundFormat: z.enum(['json', 'text']).optional(),
      });
      const data = strictSchema.parse(req.body);
      const updated = await storage.updateRelayDestination(req.params.id, user.id, data);
      if (!updated) return res.status(404).json({ error: 'Destination not found' });
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update destination", error);
    }
  });

  /** DELETE /api/relay/destinations/:id */
  app.delete("/api/relay/destinations/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const ok = await storage.deleteRelayDestination(req.params.id, user.id);
      if (!ok) return res.status(404).json({ error: 'Destination not found' });
      res.json({ deleted: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete destination", error);
    }
  });

  /** POST /api/relay/destinations/:id/test-outbound — send a test ping to a single specific outbound destination */
  app.post("/api/relay/destinations/:id/test-outbound", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { dispatchOutboundToDestination } = await import('./relay-outbound-service');
      const result = await dispatchOutboundToDestination(user.id, req.params.id, 'test_ping', {
        title: 'Keryx Outbound Test',
        summary: 'This is a test ping from your Keryx relay settings.',
        destinationId: req.params.id,
      });
      if (!result.ok) {
        return res.status(result.status === 404 ? 404 : result.status === 400 ? 400 : 502).json({
          error: result.error || 'Test ping failed',
          result,
        });
      }
      res.json({ ok: true, result });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to send test ping", error);
    }
  });

  /**
   * POST /api/relay/test — session-authenticated test fire.
   * Same logic as /api/relay/inbound but uses the logged-in session instead of API key.
   * Lets the Relay Dashboard send test payloads without copy-pasting the key.
   */
  app.post("/api/relay/test", requireAuth, relayTestLimiter, async (req, res) => {
    try {
      const parsed = relayEnvelopeSchema.safeParse({ source: 'relay_dashboard', ...req.body });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid payload' });
      }
      const { type, source, ...rest } = parsed.data as { type: string; source?: string; [k: string]: any };
      const user = req.user as User;
      const { routedTo } = await executeRelayPayload(user.id, type, source, rest, true);
      res.json({ received: true, type, routed_to: routedTo, note: 'test — fired via dashboard session auth' });
    } catch (error: any) {
      if (error?.statusCode === 400) return res.status(400).json({ error: error.message });
      sendErrorResponse(res, 500, "Relay test failed", error);
    }
  });

  /** GET /api/relay/events — recent relay events for the dashboard */
  app.get("/api/relay/events", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const events = await storage.getRelayEvents(user.id, limit);
      res.json(events);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch relay events", error);
    }
  });

  const GITHUB_REPO = "merrillnelson-netizen/Keryx";

  // In-memory cache for GitHub Releases API response (5-minute TTL)
  let githubApkCache: { data: { available: boolean; downloadUrl: string | null; releaseUrl: string | null; version: string | null; publishedAt: string | null }; expiresAt: number } | null = null;

  async function getLatestGithubApk(): Promise<{ available: boolean; downloadUrl: string | null; releaseUrl: string | null; version: string | null; publishedAt: string | null }> {
    // Serve from cache if still fresh
    if (githubApkCache && Date.now() < githubApkCache.expiresAt) {
      return githubApkCache.data;
    }

    try {
      const headers: Record<string, string> = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Keryx-Server/1.0",
      };
      const token = process.env.GITHUB_TOKEN;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers });
      if (!resp.ok) {
        const result = { available: false, downloadUrl: null, releaseUrl: null, version: null, publishedAt: null };
        githubApkCache = { data: result, expiresAt: Date.now() + 60_000 }; // 1-min cache on failure
        return result;
      }

      const data = await resp.json() as { tag_name?: string; html_url?: string; published_at?: string; assets?: Array<{ name: string; browser_download_url: string }> };
      const apkAsset = data.assets?.find(a => a.name.endsWith(".apk"));
      if (!apkAsset) {
        const result = { available: false, downloadUrl: null, releaseUrl: data.html_url ?? null, version: data.tag_name ?? null, publishedAt: data.published_at ?? null };
        githubApkCache = { data: result, expiresAt: Date.now() + 5 * 60_000 };
        return result;
      }

      const result = {
        available: true,
        downloadUrl: apkAsset.browser_download_url,
        releaseUrl: data.html_url ?? null,
        version: data.tag_name ?? null,
        publishedAt: data.published_at ?? null,
      };
      githubApkCache = { data: result, expiresAt: Date.now() + 5 * 60_000 };
      return result;
    } catch {
      const result = { available: false, downloadUrl: null, releaseUrl: null, version: null, publishedAt: null };
      githubApkCache = { data: result, expiresAt: Date.now() + 60_000 };
      return result;
    }
  }

  /**
   * GET /api/android-bridge/apk-info — check GitHub Releases for latest APK build
   * Falls back to local disk build if present.
   * Returns { available: boolean, url: string, releaseUrl: string, version: string }
   */
  app.get("/api/android-bridge/apk-info", requireAuth, async (req, res) => {
    try {
      // Prefer local disk build (CI artifact deposited here), fall back to GitHub Release
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const apkPath = join(process.cwd(), "android-bridge", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
      if (existsSync(apkPath)) {
        return res.json({ available: true, url: "/api/android-bridge/apk", releaseUrl: null, version: "local" });
      }

      const ghInfo = await getLatestGithubApk();
      res.json({
        available: ghInfo.available,
        // url points directly to GitHub asset when available; kept for backwards-compat
        url: ghInfo.downloadUrl ?? (ghInfo.available ? "/api/android-bridge/apk" : null),
        releaseUrl: ghInfo.releaseUrl ?? `https://github.com/${GITHUB_REPO}/releases`,
        version: ghInfo.version,
        publishedAt: ghInfo.publishedAt,
        githubDownloadUrl: ghInfo.downloadUrl,
      });
    } catch (error) {
      res.json({ available: false, url: null, releaseUrl: `https://github.com/${GITHUB_REPO}/releases` });
    }
  });

  /**
   * GET /api/android-bridge/apk — redirect to GitHub Release APK or stream local build
   */
  app.get("/api/android-bridge/apk", requireAuth, async (req, res) => {
    try {
      // Local build takes priority
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const apkPath = join(process.cwd(), "android-bridge", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
      if (existsSync(apkPath)) {
        res.setHeader("Content-Disposition", "attachment; filename=KeryxBridge.apk");
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        return res.sendFile(apkPath);
      }

      // Fall back to GitHub Release
      const ghInfo = await getLatestGithubApk();
      if (ghInfo.downloadUrl) {
        return res.redirect(302, ghInfo.downloadUrl);
      }

      return res.status(404).json({ message: "No APK available. Please trigger a GitHub Actions build." });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to serve APK", error);
    }
  });

  // ============================================
  // AUTOMATION RULES ROUTES
  // ============================================

  const automationRuleBodySchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    triggerType: z.string().min(1),
    // Use automationConditionsSchema for typed validation; passthrough keeps forward compat
    triggerConditions: automationConditionsSchema.optional().nullable(),
    actionType: z.string().min(1),
    actionPayload: z.record(z.any()),
    maxRunsPerDay: z.number().int().min(1).max(50).optional(),
  });

  /** GET /api/automation/rules — list all rules for the user */
  app.get("/api/automation/rules", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      const rules = await storage.getAutomationRules(user.id);
      res.json(rules);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch automation rules", error);
    }
  });

  /** POST /api/automation/rules — create a new rule */
  app.post("/api/automation/rules", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      const data = automationRuleBodySchema.parse(req.body);
      const rule = await storage.createAutomationRule({ userId: user.id, ...data });
      res.status(201).json(rule);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create automation rule", error);
    }
  });

  /** GET /api/automation/rules/:id — get one rule */
  app.get("/api/automation/rules/:id", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      const rule = await storage.getAutomationRule(req.params.id, user.id);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      res.json(rule);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch automation rule", error);
    }
  });

  /** PATCH /api/automation/rules/:id — update a rule (any fields) */
  app.patch("/api/automation/rules/:id", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      const data = automationRuleBodySchema.partial().parse(req.body);
      const rule = await storage.updateAutomationRule(req.params.id, user.id, data);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      res.json(rule);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update automation rule", error);
    }
  });

  /** DELETE /api/automation/rules/:id — delete a rule */
  app.delete("/api/automation/rules/:id", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      await storage.deleteAutomationRule(req.params.id, user.id);
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete automation rule", error);
    }
  });

  /** POST /api/automation/rules/:id/toggle — quick enable/disable */
  app.post("/api/automation/rules/:id/toggle", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      const existing = await storage.getAutomationRule(req.params.id, user.id);
      if (!existing) return res.status(404).json({ error: 'Rule not found' });
      const rule = await storage.updateAutomationRule(req.params.id, user.id, { enabled: !existing.enabled });
      res.json(rule);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to toggle automation rule", error);
    }
  });

  /** POST /api/automation/rules/:id/test — manually fire a rule for testing */
  app.post("/api/automation/rules/:id/test", requireAuth, requireTier('pro'), async (req, res) => {
    try {
      const user = req.user as User;
      const rule = await storage.getAutomationRule(req.params.id, user.id);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      if (!rule.enabled) return res.status(400).json({ error: 'Rule is disabled' });

      const { fireTrigger } = await import('./automation-engine');
      // Fire immediately with a test context — bypass daily limit check (test run)
      const testCtx = {
        userId: user.id,
        memoryContent: req.body.memoryContent || 'Test trigger from automation rules UI',
        moodScore: req.body.moodScore ?? 5,
        topics: req.body.topics || [],
        peopleNames: req.body.peopleNames || [],
        keyword: req.body.keyword || 'test',
        localHour: new Date().getHours(),
      };

      // Override the trigger type to match the rule's trigger
      await fireTrigger(user.id, rule.triggerType, testCtx);

      res.json({ success: true, message: 'Rule triggered (test mode). Check the Agent dashboard for resulting actions.' });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to test automation rule", error);
    }
  });

  // ─── Profile Observations ───────────────────────────────────────────────────

  /** GET /api/profile/observations — list all observations (optionally filtered by status) */
  app.get("/api/profile/observations", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const ALLOWED_STATUSES = ['pending', 'confirmed', 'denied'];
      const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
      if (rawStatus && !ALLOWED_STATUSES.includes(rawStatus)) {
        return res.status(400).json({ error: "Invalid status filter. Allowed: pending, confirmed, denied" });
      }
      // Expire stale pending observations before returning
      await storage.expireOldPendingObservations(user.id);
      const observations = await storage.getProfileObservations(user.id, rawStatus);
      res.json(observations);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch profile observations", error);
    }
  });

  /** POST /api/profile/observations — create a profile observation directly (confirmed by default) */
  app.post("/api/profile/observations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const parseResult = insertProfileObservationSchema.safeParse({ ...req.body, userId: user.id });
      if (!parseResult.success) return res.status(400).json({ error: parseResult.error.flatten() });
      const observation = await storage.createProfileObservation(parseResult.data);
      res.status(201).json(observation);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create profile observation", error);
    }
  });

  /** PATCH /api/profile/observations/:id — update observation status (confirmed/denied) */
  app.patch("/api/profile/observations/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { status } = req.body;
      if (!['confirmed', 'denied', 'pending'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'confirmed', 'denied', or 'pending'" });
      }
      const updated = await storage.updateProfileObservationStatus(id, user.id, status);
      if (!updated) return res.status(404).json({ error: "Observation not found" });
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update observation", error);
    }
  });

  /** POST /api/profile/observations/generate — manually trigger observation generation */
  app.post("/api/profile/observations/generate", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const { generateObservations } = await import('./profile-observation-service');
      const count = await generateObservations(user.id);
      res.json({ generated: count });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to generate observations", error);
    }
  });

  // ============================================================
  // KERYX CHAT — Free-form AI conversation with ecosystem context
  // ============================================================

  /** Build rich system prompt for Keryx Chat using user's life ecosystem */
  async function buildChatSystemPrompt(userId: string): Promise<string> {
    const [userSettings, recentMemories, activeGoals, confirmedObsText, people] = await Promise.all([
      storage.getSettings(userId),
      storage.getRecentLogEntriesLight(userId, 30, 20),
      storage.getActiveGoals(userId),
      storage.getConfirmedObservationsText(userId),
      storage.getPeople(userId),
    ]);

    const { getKeryxPersona } = await import('./ai-service');
    const sassLevel = userSettings?.sassLevel ?? 50;
    const professionalMode = userSettings?.professionalMode ?? false;
    const timezone = userSettings?.userTimezone ?? 'America/Denver';
    const persona = getKeryxPersona(sassLevel, professionalMode);

    const now = new Date().toLocaleString('en-US', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' });

    const memorySummary = recentMemories.length > 0
      ? (recentMemories as Partial<LogEntry>[]).map((m, i: number) => {
          const when = m.timestamp ? new Date(m.timestamp).toLocaleDateString('en-US', { timeZone: timezone, month: 'short', day: 'numeric' }) : '';
          const text = (m.memoryText || '').slice(0, 150);
          return `${i + 1}. [${when}] ${text}`;
        }).join('\n')
      : 'No recent memories.';

    const goalsSummary = activeGoals.length > 0
      ? (activeGoals as Goal[]).map((g) => `• ${g.title} (${g.progressPercent ?? 0}%)`).join('\n')
      : 'No active goals.';

    const topPeople = (people as Person[])
      .filter((p) => (p.mentionCount ?? 0) > 0)
      .sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0))
      .slice(0, 10)
      .map((p) => `${p.name}${p.relationship ? ` (${p.relationship})` : ''}`)
      .join(', ') || 'None tracked yet.';

    const userProfile = userSettings?.userProfile?.trim() || '';

    return `${persona}

---
CURRENT CONTEXT (use this to inform your responses — reference it naturally, not robotically):

Current date/time: ${now}

${userProfile ? `USER'S OWN WORDS ABOUT THEMSELVES:\n${userProfile}\n` : ''}
${confirmedObsText ? `CONFIRMED AI OBSERVATIONS:\n${confirmedObsText}\n` : ''}
RECENT MEMORIES (last 30 days, newest first):
${memorySummary}

ACTIVE GOALS:
${goalsSummary}

FREQUENTLY MENTIONED PEOPLE:
${topPeople}
---

You are having a direct conversation with the user. This is free-form — they might be problem-solving, venting, brainstorming, researching, or just talking. Respond naturally using the context above when relevant. Do NOT dump all the context at them — weave it in only when it adds value.

SAVE ACTIONS: If the user says "save that" or types just "save that" / "log that", identify the most important insight or fact from the recent conversation and present it clearly labeled as either something to "Save That" (for AI context across Keryx) or "Log That" (to add as a memory entry). Keep the candidate concise — 1-2 sentences max.`;
  }

  /** GET /api/chat/sessions — list all sessions for user */
  app.get("/api/chat/sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const sessions = await storage.getAiChatSessions(user.id);
      res.json(sessions);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch chat sessions", error);
    }
  });

  /** POST /api/chat/sessions — create new session */
  app.post("/api/chat/sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const session = await storage.createAiChatSession(user.id, 'New Chat');
      res.status(201).json(session);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to create chat session", error);
    }
  });

  /** DELETE /api/chat/sessions/:id — delete a session */
  app.delete("/api/chat/sessions/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const deleted = await storage.deleteAiChatSession(req.params.id, user.id);
      if (!deleted) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to delete chat session", error);
    }
  });

  /** PATCH /api/chat/sessions/:id — update session title */
  app.patch("/api/chat/sessions/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: "Title is required" });
      const updated = await storage.updateAiChatSession(req.params.id, user.id, { title });
      if (!updated) return res.status(404).json({ error: "Session not found" });
      res.json(updated);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to update session", error);
    }
  });

  /** GET /api/chat/sessions/:id/messages — get messages for a session */
  app.get("/api/chat/sessions/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const session = await storage.getAiChatSession(req.params.id, user.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      const messages = await storage.getAiChatMessages(req.params.id, user.id);
      res.json(messages);
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch messages", error);
    }
  });

  /** POST /api/chat/sessions/:id/messages — send user message, get AI reply */
  app.post("/api/chat/sessions/:id/messages", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "Message content is required" });

      const session = await storage.getAiChatSession(req.params.id, user.id);
      if (!session) return res.status(404).json({ error: "Session not found" });

      // Save user message
      const userMsg = await storage.createAiChatMessage({
        sessionId: session.id,
        userId: user.id,
        role: 'user',
        content: content.trim(),
      });

      // Get conversation history for context
      const history = await storage.getAiChatMessages(session.id, user.id);
      const systemPrompt = await buildChatSystemPrompt(user.id);

      // Detect typed save/log intent — when user types "save that" / "log that" etc.,
      // generate explicit structured candidates from the recent conversation
      const CHAT_SAVE_TRIGGERS = ['save that', 'log that', 'remember that', 'save this', 'log this'];
      const trimmedLower = content.trim().toLowerCase();
      let intentCandidates: Array<{ text: string; type: 'save' | 'log' }> | null = null;
      if (CHAT_SAVE_TRIGGERS.some((t) => trimmedLower === t || trimmedLower.startsWith(t + ' '))) {
        try {
          const recentForIntent = history.slice(-6); // last 6 messages before user's trigger
          const intentCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `The user just said "${content.trim()}" — they want to save something from this conversation.
Review the recent messages and identify 1-2 of the most specific, concrete things worth preserving.
For each, choose:
- "save": an insight, pattern, belief, preference, or observation about the user (to feed into AI context)
- "log": a concrete event, decision, experience, or fact (to add as a memory journal entry)

Return JSON: {"candidates": [{"text": "...", "type": "save"}, {"text": "...", "type": "log"}]}
Keep each text to 1-2 sentences. Be specific, not generic. Only return 1-2 candidates.`,
              },
              ...recentForIntent.map((m: AiChatMessage) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            ],
            max_tokens: 250,
            temperature: 0.4,
          });
          const raw = intentCompletion.choices[0]?.message?.content || '{}';
          const parsed = JSON.parse(raw) as { candidates?: Array<{ text: string; type: string }> };
          if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
            intentCandidates = parsed.candidates
              .filter((c) => c.text && (c.type === 'save' || c.type === 'log'))
              .slice(0, 2)
              .map((c) => ({ text: c.text, type: c.type as 'save' | 'log' }));
          }
        } catch (_) { /* intent detection failure is non-fatal */ }
      }

      // Build messages array for OpenAI
      const openaiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
        ...history.map((m: AiChatMessage) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        max_tokens: 800,
        temperature: 0.8,
      });

      const aiContent = completion.choices[0]?.message?.content || "I couldn't generate a response.";

      // Save AI message
      const aiMsg = await storage.createAiChatMessage({
        sessionId: session.id,
        userId: user.id,
        role: 'assistant',
        content: aiContent,
      });

      // Update session metadata
      const newCount = (session.messageCount ?? 0) + 2;
      await storage.updateAiChatSession(session.id, user.id, {
        lastMessageAt: new Date(),
        messageCount: newCount,
      });

      // Auto-generate title after 2nd user message (when there are now 4+ messages)
      if (newCount >= 4 && session.title === 'New Chat') {
        try {
          const titleCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Generate a concise 3-5 word title for this conversation. Return ONLY the title — no quotes, no punctuation, no explanation.' },
              ...history.slice(0, 4).map((m: AiChatMessage) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            ],
            max_tokens: 20,
            temperature: 0.5,
          });
          const newTitle = titleCompletion.choices[0]?.message?.content?.trim();
          if (newTitle && newTitle.length > 0 && newTitle.length < 60) {
            await storage.updateAiChatSession(session.id, user.id, { title: newTitle });
          }
        } catch (_) { /* title generation failure is non-fatal */ }
      }

      // After ~8 messages (and every 8 thereafter), proactively offer a session summary
      // with 2-3 labeled Save/Log candidates the user can act on or dismiss
      let summaryOffer: { candidates: Array<{ text: string; type: 'save' | 'log' }> } | null = null;
      if (newCount > 0 && newCount % 8 === 0) {
        try {
          const recentHistory = history.slice(-8);
          const summaryCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `You are reviewing a conversation excerpt. Identify 2-3 of the most valuable pieces of information that are worth saving.
For each one, decide whether it should be:
- "save": A self-insight, belief, pattern, preference, or observation about the person (feeds into the AI's understanding of them)
- "log": A concrete event, decision, experience, or fact that belongs in their memory journal

Return JSON exactly like:
{"candidates": [{"text": "...", "type": "save"}, {"text": "...", "type": "log"}]}

Keep each text to 1-2 sentences max. Only return 2-3 candidates. If nothing is worth saving, return {"candidates": []}.`,
              },
              ...recentHistory.map((m: AiChatMessage) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            ],
            max_tokens: 300,
            temperature: 0.5,
          });
          const raw = summaryCompletion.choices[0]?.message?.content || '{}';
          const parsed = JSON.parse(raw) as { candidates?: Array<{ text: string; type: string }> };
          if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
            summaryOffer = {
              candidates: parsed.candidates
                .filter((c) => c.text && (c.type === 'save' || c.type === 'log'))
                .slice(0, 3)
                .map((c) => ({ text: c.text, type: c.type as 'save' | 'log' })),
            };
          }
        } catch (_) { /* summary offer failure is non-fatal */ }
      }

      res.json({ userMessage: userMsg, aiMessage: aiMsg, summaryOffer, intentCandidates });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to process chat message", error);
    }
  });

  /** POST /api/chat/messages/:id/save — save a message as 'ecosystem' or 'memory' */
  app.post("/api/chat/messages/:id/save", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { savedAs, memoryText } = req.body as { savedAs: 'ecosystem' | 'memory'; memoryText?: string };

      if (!['ecosystem', 'memory'].includes(savedAs)) {
        return res.status(400).json({ error: "savedAs must be 'ecosystem' or 'memory'" });
      }

      const updated = await storage.markAiChatMessageSaved(req.params.id, user.id, savedAs);
      if (!updated) return res.status(404).json({ error: "Message not found" });

      if (savedAs === 'ecosystem') {
        // Save as a confirmed profile observation so it feeds into AI context everywhere
        const text = memoryText || updated.content.slice(0, 300);
        await storage.createProfileObservation({
          userId: user.id,
          observation: text,
          category: 'patterns',
          evidenceSummary: 'Saved from Keryx Chat conversation',
          status: 'confirmed',
          confidence: 1.0,
        });
        res.json({ success: true, savedAs: 'ecosystem' });
      } else {
        // Log as a regular memory entry
        const text = memoryText || updated.content;
        const { extractMetadata: extract } = await import('./ai-service');
        const userSettings = await storage.getSettings(user.id);
        const meta = await extract(text, userSettings?.userTimezone ?? undefined);
        const entry = await storage.createLogEntry({
          userId: user.id,
          memoryText: text,
          topicTag: meta.topicTag || 'Chat',
          metadataJson: meta.metadataJson || {},
          mood: meta.mood,
          moodScore: meta.moodScore,
          detectedPeople: meta.detectedPeople || [],
          importance: meta.importance || 5,
        });
        res.json({ success: true, savedAs: 'memory', entryId: entry.id });
      }
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to save message", error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
