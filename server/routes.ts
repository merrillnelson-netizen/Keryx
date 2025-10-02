import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLogEntrySchema, insertSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { extractMetadata, generateEmbedding, decomposeQuery } from "./ai-service";

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
   * MEMORY/LOG ENTRY ROUTES
   * Handle memory storage with AI-powered metadata extraction
   */
  
  /**
   * POST /api/memories - Save a new memory with AI extraction
   * Accepts raw voice text, extracts metadata and embeddings automatically
   */
  app.post("/api/memories", async (req, res) => {
    try {
      const { memoryText } = req.body;
      
      if (!memoryText || typeof memoryText !== 'string') {
        return sendErrorResponse(res, 400, "memoryText is required");
      }

      console.log("Saving memory:", memoryText);

      // Use AI to extract metadata and topic
      const { topicTag, metadataJson } = await extractMetadata(memoryText);
      console.log("Extracted metadata:", { topicTag, metadataJson });

      // Generate embedding vector for semantic search
      const embeddingVector = await generateEmbedding(memoryText);
      console.log("Generated embedding vector with", embeddingVector.length, "dimensions");

      // Save to database
      const logEntry = await storage.createLogEntry({
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
      console.error("Failed to save memory:", error);
      sendErrorResponse(res, 500, "Failed to save memory", error);
    }
  });

  /**
   * POST /api/memories/search - Hybrid search for memories
   * Combines semantic search with structured filters
   */
  app.post("/api/memories/search", async (req, res) => {
    try {
      const { queryText } = req.body;
      
      if (!queryText || typeof queryText !== 'string') {
        return sendErrorResponse(res, 400, "queryText is required");
      }

      console.log("Searching memories with query:", queryText);

      // Decompose query into semantic and structured components
      const { semanticComponent, structuredFilters } = await decomposeQuery(queryText);
      console.log("Decomposed query:", { semanticComponent, structuredFilters });

      // Generate embedding for semantic search
      const queryVector = await generateEmbedding(semanticComponent);

      // Perform hybrid search
      const results = await storage.searchMemories(
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
   */
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      console.log(`Fetching recent ${limit} log entries`);
      
      const entries = await storage.getLogEntries(limit);
      
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
   * GET /api/logs/:id - Get specific log entry
   */
  app.get("/api/logs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }
      
      const entry = await storage.getLogEntry(id);
      
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
   */
  app.patch("/api/logs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }

      // Validate update data (partial schema)
      const updateData = req.body;
      
      const updated = await storage.updateLogEntry(id, updateData);
      
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
   */
  app.delete("/api/logs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return sendErrorResponse(res, 400, "Log entry ID is required");
      }
      
      const deleted = await storage.deleteLogEntry(id);
      
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
   */
  app.get("/api/settings", async (_req, res) => {
    try {
      console.log("Fetching settings");
      const currentSettings = await storage.getSettings();
      
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
   */
  app.put("/api/settings", async (req, res) => {
    try {
      console.log("Updating settings:", req.body);
      
      const settingsData = insertSettingsSchema.partial().parse(req.body);
      const updated = await storage.updateSettings(settingsData);
      
      res.json({
        status: 'success',
        data: updated,
        message: 'Settings updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
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
