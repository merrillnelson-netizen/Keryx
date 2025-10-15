import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLogEntrySchema, insertSettingsSchema, insertUserSchema, VALID_CATEGORIES } from "@shared/schema";
import { z } from "zod";
import { extractMetadata, generateEmbedding, decomposeQuery } from "./ai-service";
import bcrypt from "bcrypt";
import passport from "./auth";
import { requireAuth } from "./auth";

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
  app.post("/api/auth/signup", async (req, res) => {
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
  app.post("/api/auth/login", (req, res, next) => {
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
   * Requires authentication
   */
  app.post("/api/memories", requireAuth, async (req, res) => {
    try {
      const { memoryText, topicTag: userProvidedTag } = req.body;
      const user = req.user as any;
      
      if (!memoryText || typeof memoryText !== 'string') {
        return sendErrorResponse(res, 400, "memoryText is required");
      }

      // Validate category if provided
      if (userProvidedTag && !VALID_CATEGORIES.includes(userProvidedTag as any)) {
        return sendErrorResponse(res, 400, `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
      }

      // Use user-provided category or AI extraction
      let topicTag: string;
      let metadataJson: Record<string, any>;
      
      if (userProvidedTag) {
        // User manually selected category - skip AI extraction
        topicTag = userProvidedTag;
        metadataJson = {}; // No AI-extracted metadata when manually categorized
      } else {
        // Use AI to extract metadata and topic
        const extracted = await extractMetadata(memoryText);
        topicTag = extracted.topicTag;
        metadataJson = extracted.metadataJson;
      }

      // Generate embedding vector for semantic search
      const embeddingVector = await generateEmbedding(memoryText);
      const isZeroVector = embeddingVector.every(v => v === 0);
      if (isZeroVector) {
        console.warn("Using zero vector fallback - OpenAI embedding may have failed");
      }

      // Save to database with user ID
      const logEntry = await storage.createLogEntry({
        userId: user.id,
        memoryText,
        topicTag,
        metadataJson,
        embeddingVector,
      });

      res.status(201).json({
        status: 'success',
        data: logEntry,
        message: 'Memory saved successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to save memory - Full error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
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

      if (!topicTag || typeof topicTag !== 'string') {
        return sendErrorResponse(res, 400, "topicTag is required");
      }

      // Validate category
      if (!VALID_CATEGORIES.includes(topicTag as any)) {
        return sendErrorResponse(res, 400, `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
      }

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
  app.post("/api/memories/search", requireAuth, async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
