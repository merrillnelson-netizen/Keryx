import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLogEntrySchema, insertSettingsSchema, insertUserSchema, insertCategorySchema, insertPersonSchema, mcpPayloadSchema, type User, type MCPPayload } from "@shared/schema";
import { z } from "zod";
import { extractMetadata, generateEmbedding, decomposeQuery, generateThematicInsights, generateMorningBriefing, detectPatternAlerts } from "./ai-service";
import bcrypt from "bcrypt";
import passport from "./auth";
import { requireAuth } from "./auth";
import rateLimit from "express-rate-limit";
import { isCalendarConnected, isGoogleCalendarConnected, getConnectedCalendarProvider, getTodaysEvents, findRelevantEvent, createCalendarEvent, findDuplicateEvent, type CalendarEvent } from "./calendar-service";
import { isOutlookConnected } from "./outlook-calendar-service";
import { isGmailConnected } from "./gmail-service";
import { isOutlookMailConnected } from "./outlook-mail-service";
import { detectCalendarEvent, type DetectedCalendarEvent } from "./ai-service";

// Background job tracking for re-analysis
interface BackfillJob {
  status: 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  processed: number;
  calendarLinked: number;
  errors: number;
  startedAt: Date;
  completedAt?: Date;
  message?: string;
}
const backfillJobs = new Map<string, BackfillJob>();

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
    return user?.id?.toString() || 'anonymous';
  },
  validate: { xForwardedForHeader: false },
});

// Validation schemas for API endpoints
const calendarEventDetectSchema = z.object({
  memoryText: z.string().min(1, "Memory text is required").max(5000, "Memory text too long"),
});

const calendarEventCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  startDateTime: z.string().min(1, "Start time is required"),
  endDateTime: z.string().min(1, "End time is required"),
  attendees: z.array(z.string()).optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  memoryId: z.string().uuid().optional(),
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
function sendErrorResponse(res: any, statusCode: number, message: string, error?: any) {
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
    passport.authenticate('local', (err: any, user: any, info: any) => {
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
      const user = req.user as any;
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
   * MEMORY/LOG ENTRY ROUTES
   * Handle memory storage with AI-powered metadata extraction
   * All routes require authentication
   */
  
  /**
   * POST /api/memories - Save a new memory with optional manual category
   * Accepts raw voice text and optional topicTag
   * If topicTag provided, uses it; otherwise extracts metadata with AI
   * Now includes mood detection and people tracking
   * Requires authentication
   */
  app.post("/api/memories", requireAuth, aiLimiter, async (req, res) => {
    try {
      const { 
        memoryText, 
        topicTag: userProvidedTag,
        geoLat,
        geoLng,
        geoAccuracyMeters,
        geoPlaceName,
      } = req.body;
      const user = req.user as any;
      
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

      // Always extract metadata with AI (now includes mood and people)
      const extracted = await extractMetadata(memoryText);
      
      // Use user-provided category or AI extraction
      const topicTag = userProvidedTag || extracted.topicTag;
      const metadataJson = userProvidedTag ? {} : extracted.metadataJson;

      // Generate embedding vector for semantic search
      const embeddingVector = await generateEmbedding(memoryText);
      const isZeroVector = embeddingVector.every(v => v === 0);
      if (isZeroVector) {
        console.warn("Using zero vector fallback - OpenAI embedding may have failed");
      }

      // Try to link to a calendar event if available
      let calendarEventId: string | undefined;
      let calendarEventTitle: string | undefined;
      let calendarEventAttendees: string[] | undefined;
      let calendarReasoning: string | undefined;
      
      try {
        const settings = await storage.getSettings(user.id);
        if (settings?.calendarAutoLink !== false) {
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
        // Calendar auto-link not available - this is expected when calendar is not connected
      }

      // Combine AI reasoning with calendar reasoning
      const aiReasoning = extracted.aiReasoning ? {
        ...extracted.aiReasoning,
        ...(calendarReasoning ? { calendar: calendarReasoning } : {})
      } : calendarReasoning ? { calendar: calendarReasoning } : undefined;

      // Save to database with user ID, mood, detected people, geolocation, and calendar
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
      });

      // Track people mentions in the people table (non-blocking)
      if (extracted.detectedPeople.length > 0) {
        Promise.all(
          extracted.detectedPeople.map(name => storage.upsertPerson(user.id, name))
        ).catch(err => console.error("Failed to track people:", err));
      }

      res.status(201).json({
        status: 'success',
        data: logEntry,
        message: 'Memory saved successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Log error for debugging but don't expose details to client
      console.error("Failed to save memory:", error instanceof Error ? error.message : error);
      sendErrorResponse(res, 500, "Failed to save memory. Please try again.", error);
    }
  });

  /**
   * PATCH /api/memories/:id - Update category on existing memory
   * Allows users to manually change the category of a saved memory
   * Requires authentication and ownership verification
   */
  app.patch("/api/memories/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { topicTag } = req.body;
      const user = req.user as any;

      if (!id || typeof id !== 'string') {
        return sendErrorResponse(res, 400, "Memory ID is required");
      }

      if (!topicTag || typeof topicTag !== 'string' || topicTag.trim() === '') {
        return sendErrorResponse(res, 400, "topicTag is required and must be a non-empty string");
      }

      // Auto-create category if it doesn't exist
      await storage.createCategoryIfNotExists(user.id, topicTag);

      // Update the memory (with user ownership verification)
      const updatedEntry = await storage.updateLogEntry(id, user.id, { topicTag });

      if (!updatedEntry) {
        return sendErrorResponse(res, 404, "Memory not found or you don't have permission to edit it");
      }

      res.json({
        status: 'success',
        data: updatedEntry,
        message: 'Category updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to update memory category:", error);
      sendErrorResponse(res, 500, "Failed to update memory category", error);
    }
  });

  /**
   * POST /api/memories/search - Hybrid search for memories
   * Combines semantic search with structured filters
   * Requires authentication
   */
  app.post("/api/memories/search", requireAuth, aiLimiter, async (req, res) => {
    try {
      const { queryText } = req.body;
      const user = req.user as any;
      
      if (!queryText || typeof queryText !== 'string') {
        return sendErrorResponse(res, 400, "queryText is required");
      }

      // Run query decomposition and embedding generation in parallel for speed
      const [decomposed, queryVector] = await Promise.all([
        decomposeQuery(queryText),
        generateEmbedding(queryText)
      ]);
      
      const { semanticComponent, structuredFilters } = decomposed;

      // Perform hybrid search
      const results = await storage.searchMemories(
        user.id,
        queryVector,
        structuredFilters.topicTag,
        structuredFilters.timestampFilter?.start,
        structuredFilters.timestampFilter?.end,
        structuredFilters.metadataFilters,
        10 // limit to top 10 results
      );

      res.json({
        status: 'success',
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
      console.error("Failed to search memories:", error);
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
  app.post("/api/companion/action", requireAuth, aiLimiter, async (req, res) => {
    try {
      const payload = mcpPayloadSchema.parse(req.body);
      const user = req.user as any;

      if (payload.action === 'record') {
        // Handle memory recording with full context
        const extracted = await extractMetadata(payload.transcript);
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
      console.error("Companion action failed:", error);
      sendErrorResponse(res, 500, "Failed to process companion action", error);
    }
  });

  /**
   * GET /api/logs - Get recent memories/log entries
   * Returns recent memories ordered by timestamp
   * Requires authentication
   */
  app.get("/api/logs", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const entries = await storage.getLogEntries(user.id, limit);
      
      res.json({
        status: 'success',
        data: entries,
        count: entries.length,
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
      const user = req.user as any;
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
      
      res.status(201).json({
        status: 'success',
        data: logEntry,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to create log entry:", error);
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
      const user = req.user as any;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }
      
      const entry = await storage.getLogEntry(id, user.id);
      
      if (!entry) {
        return sendErrorResponse(res, 404, "Log entry not found");
      }
      
      res.json({
        status: 'success',
        data: entry,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch log entry", error);
    }
  });

  /**
   * PATCH /api/logs/:id - Update log entry
   * Requires authentication
   */
  app.patch("/api/logs/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as any;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }

      // Validate update data (partial schema)
      const updateData = req.body;
      
      const updated = await storage.updateLogEntry(id, user.id, updateData);
      
      if (!updated) {
        return sendErrorResponse(res, 404, "Log entry not found");
      }
      
      res.json({
        status: 'success',
        data: updated,
        message: 'Log entry updated successfully',
        timestamp: new Date().toISOString()
      });
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
      const user = req.user as any;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }
      
      const deleted = await storage.deleteLogEntry(id, user.id);
      
      if (!deleted) {
        return sendErrorResponse(res, 404, "Log entry not found");
      }
      
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
      const user = req.user as any;
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
      const user = req.user as any;
      
      const settingsData = insertSettingsSchema.partial().parse(req.body);
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
      const [googleCalendar, outlookCalendar, gmail, outlookMail, userSettings] = await Promise.all([
        isGoogleCalendarConnected(),
        isOutlookConnected(),
        isGmailConnected(),
        isOutlookMailConnected(),
        storage.getSettings(user.id)
      ]);
      
      // Determine active calendar provider based on user preference, then fallback to availability
      let activeCalendarProvider: string | null = null;
      if (userSettings?.calendarProvider) {
        // User has a preference - use it if that provider is connected
        if (userSettings.calendarProvider === 'google' && googleCalendar) {
          activeCalendarProvider = 'google';
        } else if (userSettings.calendarProvider === 'outlook' && outlookCalendar) {
          activeCalendarProvider = 'outlook';
        }
      }
      // Fallback: auto-detect (prefer Google when both connected)
      if (!activeCalendarProvider) {
        activeCalendarProvider = googleCalendar ? 'google' : outlookCalendar ? 'outlook' : null;
      }
      
      // Determine active email provider based on user preference, then fallback to availability
      let activeEmailProvider: string | null = null;
      if (userSettings?.emailProvider) {
        // User has a preference - use it if that provider is connected
        if (userSettings.emailProvider === 'gmail' && gmail) {
          activeEmailProvider = 'gmail';
        } else if (userSettings.emailProvider === 'outlook' && outlookMail) {
          activeEmailProvider = 'outlook';
        }
      }
      // Fallback: auto-detect (prefer Gmail when both connected)
      if (!activeEmailProvider) {
        activeEmailProvider = gmail ? 'gmail' : outlookMail ? 'outlook' : null;
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
        },
        providerSelectionMode: userSettings?.providerSelectionMode || 'default',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({
        status: 'success',
        calendar: { google: false, outlook: false, activeProvider: null, userPreference: null },
        email: { gmail: false, outlook: false, activeProvider: null, userPreference: null },
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
      console.error("Failed to fetch today's events:", error);
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
      console.error("Failed to fetch current event:", error);
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
      const { memoryText } = validation.data;

      const detectedEvent = await detectCalendarEvent(memoryText);
      
      res.json({
        status: 'success',
        data: detectedEvent,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to detect calendar event:", error);
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
      const { title, startDateTime, endDateTime, attendees, location, description, memoryId } = validation.data;

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

      // Create the event
      const createdEvent = await createCalendarEvent(title, startDateTime, endDateTime, {
        attendees,
        location,
        description,
      });

      if (!createdEvent) {
        return sendErrorResponse(res, 500, "Failed to create calendar event");
      }

      // If memoryId provided, link the event back to the memory
      if (memoryId) {
        const user = req.user as any;
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
      console.error("Failed to create calendar event:", error);
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
      console.error("Failed to check for duplicate event:", error);
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
      const user = req.user as any;
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
      const user = req.user as any;
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
      const user = req.user as any;
      
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
      const user = req.user as any;
      const { name } = req.params;
      
      if (!name) {
        return sendErrorResponse(res, 400, "Person name is required");
      }
      
      const mentions = await storage.getPersonMentions(user.id, decodeURIComponent(name));
      
      res.json({
        status: 'success',
        data: mentions,
        count: mentions.length,
        personName: decodeURIComponent(name),
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
      const user = req.user as any;
      const { id } = req.params;
      const updateData = insertPersonSchema.partial().parse(req.body);
      
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
      const user = req.user as any;
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
      const user = req.user as any;
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
   * GET /api/mood/:mood - Get all memories with a specific mood
   * Requires authentication
   */
  app.get("/api/mood/:mood", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
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
      const user = req.user as any;
      const memories = await storage.getOnThisDayMemories(user.id);
      
      const today = new Date();
      
      res.json({
        status: 'success',
        data: memories,
        count: memories.length,
        date: {
          month: today.getMonth() + 1,
          day: today.getDate(),
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
  app.post("/api/insights", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const validation = insightsQuerySchema.safeParse(req.body);
      if (!validation.success) {
        return sendErrorResponse(res, 400, validation.error.errors[0]?.message || "Invalid request");
      }
      const { question, days } = validation.data;
      
      // Get recent memories for analysis
      const memories = await storage.getLogEntries(user.id, 100);
      
      // Filter to requested time period
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const filteredMemories = memories.filter(m => m.timestamp >= startDate);
      
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
      
      // Generate insights
      const insights = await generateThematicInsights(
        filteredMemories.map(m => ({
          memoryText: m.memoryText,
          mood: m.mood || undefined,
          moodScore: m.moodScore || undefined,
          timestamp: m.timestamp,
          topicTag: m.topicTag,
        })),
        question
      );
      
      res.json({
        status: 'success',
        data: insights,
        memoriesAnalyzed: filteredMemories.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to generate insights:", error);
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
   */
  app.get("/api/briefing", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const localHour = parseInt(req.query.localHour as string) || new Date().getHours();
      
      // Get memories from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const memories = await storage.getLogEntries(user.id, 100);
      const recentMemories = memories.filter((m: any) => m.timestamp >= sevenDaysAgo);
      
      // Fetch recent emails from user's preferred provider (or any connected provider)
      let emailContext: Array<{ subject: string; from: string; snippet: string; date: Date }> = [];
      try {
        const userSettings = await storage.getSettings(user.id);
        const preferredEmailProvider = userSettings?.emailProvider;
        
        // Try Gmail first (if preferred or no preference)
        if (!preferredEmailProvider || preferredEmailProvider === 'gmail') {
          const gmailConnected = await isGmailConnected();
          if (gmailConnected) {
            const { getRecentEmails } = await import('./gmail-service');
            const emails = await getRecentEmails(10);
            emailContext = emails.map(e => ({
              subject: e.subject,
              from: e.from,
              snippet: e.snippet,
              date: e.date
            }));
          }
        }
        
        // Try Outlook if Gmail not available or not preferred
        if (emailContext.length === 0 && (!preferredEmailProvider || preferredEmailProvider === 'outlook')) {
          const outlookConnected = await isOutlookMailConnected();
          if (outlookConnected) {
            const { getOutlookRecentEmails } = await import('./outlook-mail-service');
            const emails = await getOutlookRecentEmails(10);
            emailContext = emails.map(e => ({
              subject: e.subject,
              from: e.from,
              snippet: e.snippet,
              date: e.date
            }));
          }
        }
      } catch (emailError) {
        // Email fetch failed, continue without email context
      }
      
      // Get user's active projects for priority weighting
      const userSettings = await storage.getSettings(user.id);
      const activeProjects = userSettings?.activeProjects || undefined;
      
      const briefing = await generateMorningBriefing(
        recentMemories.map((m: any) => ({
          memoryText: m.memoryText,
          mood: m.mood || undefined,
          moodScore: m.moodScore || undefined,
          timestamp: m.timestamp,
          topicTag: m.topicTag,
          detectedPeople: m.detectedPeople || undefined,
        })),
        user.username,
        localHour,
        emailContext.length > 0 ? emailContext : undefined,
        activeProjects
      );
      
      res.json({
        status: 'success',
        data: briefing,
        memoriesAnalyzed: recentMemories.length,
        emailsAnalyzed: emailContext.length,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to generate briefing:", error);
      sendErrorResponse(res, 500, "Failed to generate briefing", error);
    }
  });

  /**
   * GET /api/alerts - Get pattern alerts for the user
   * 
   * Analyzes recent memories to detect significant patterns
   * and returns actionable alerts.
   */
  app.get("/api/alerts", requireAuth, aiLimiter, async (req, res) => {
    try {
      const user = req.user as User;
      const days = parseInt(req.query.days as string) || 14;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const memories = await storage.getLogEntries(user.id, 100);
      const recentMemories = memories.filter((m: any) => m.timestamp >= startDate);
      
      const alerts = await detectPatternAlerts(
        recentMemories.map((m: any) => ({
          memoryText: m.memoryText,
          mood: m.mood || undefined,
          moodScore: m.moodScore || undefined,
          timestamp: m.timestamp,
          topicTag: m.topicTag,
        }))
      );
      
      res.json({
        status: 'success',
        data: alerts,
        memoriesAnalyzed: recentMemories.length,
        periodDays: days,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to detect patterns:", error);
      sendErrorResponse(res, 500, "Failed to detect patterns", error);
    }
  });

  /**
   * POST /api/backfill - Start background re-analysis of memories
   * 
   * Re-processes all memories to extract mood, moodScore, detectedPeople,
   * and link to calendar events. Runs in background and returns immediately.
   */
  app.post("/api/backfill", requireAuth, async (req, res) => {
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
      
      const { force: forceAll, includeCalendar } = validation.data;
      
      // Get entries and set up job tracking
      const entries = await storage.getLogEntries(user.id, 500);
      const entriesNeedingBackfill = forceAll ? entries : entries.filter((e: any) => {
        const hasMood = e.mood && e.mood.trim() !== '';
        const hasPeople = Array.isArray(e.detectedPeople) && e.detectedPeople.length > 0;
        const hasCalendar = e.calendarEventId && e.calendarEventId.trim() !== '';
        return !hasMood || !hasPeople || (includeCalendar && !hasCalendar);
      });
      
      // Initialize job tracking
      const job: BackfillJob = {
        status: 'running',
        progress: 0,
        total: entriesNeedingBackfill.length,
        processed: 0,
        calendarLinked: 0,
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
              const metadata = await extractMetadata(entry.memoryText);
              
              const updateData: any = {
                mood: metadata.mood,
                moodScore: metadata.moodScore,
                detectedPeople: metadata.detectedPeople,
              };
              
              if (calendarConnected && !entry.calendarEventId && entry.timestamp) {
                try {
                  const relevantEvent = await findRelevantEvent(entry.timestamp);
                  if (relevantEvent) {
                    updateData.calendarEventId = relevantEvent.id;
                    updateData.calendarEventTitle = relevantEvent.title;
                    updateData.calendarEventAttendees = relevantEvent.attendees || [];
                    job.calendarLinked++;
                  }
                } catch (calErr) {
                  console.warn(`Calendar lookup failed for entry ${entry.id}:`, calErr);
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
          
          // Mark complete
          job.status = 'completed';
          job.completedAt = new Date();
          job.message = `Completed! Analyzed ${job.processed} memories${job.calendarLinked > 0 ? `, linked ${job.calendarLinked} to calendar` : ''}.`;
          
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

  const httpServer = createServer(app);
  return httpServer;
}
