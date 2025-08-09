import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTemplateSchema, insertLogEntrySchema, insertSettingsSchema } from "@shared/schema";
import { z } from "zod";

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
   * TEMPLATE MANAGEMENT ROUTES
   * Handle template CRUD operations with validation and error handling
   */
  
  /**
   * GET /api/templates - Retrieve all templates
   * Returns array of template objects ordered by creation date
   */
  app.get("/api/templates", async (_req, res) => {
    try {
      console.log("Fetching all templates");
      const templates = await storage.getTemplates();
      
      res.json({
        status: 'success',
        data: templates,
        count: templates.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch templates", error);
    }
  });

  /**
   * GET /api/templates/active - Get currently active template
   * Returns the template marked as active for voice command processing
   */
  app.get("/api/templates/active", async (_req, res) => {
    try {
      console.log("Fetching active template");
      const template = await storage.getActiveTemplate();
      
      if (!template) {
        return sendErrorResponse(res, 404, "No active template found. Please activate a template first.");
      }
      
      res.json({
        status: 'success',
        data: template,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendErrorResponse(res, 500, "Failed to fetch active template", error);
    }
  });

  /**
   * POST /api/templates - Create new template
   * Validates input data and creates template with proper error handling
   */
  app.post("/api/templates", async (req, res) => {
    try {
      console.log("Creating new template:", req.body);
      
      // Validate input data using Zod schema
      const template = insertTemplateSchema.parse(req.body);
      
      // Check for duplicate template names
      const existingTemplates = await storage.getTemplates();
      const duplicate = existingTemplates.find(t => t.name.toLowerCase() === template.name.toLowerCase());
      
      if (duplicate) {
        return sendErrorResponse(res, 409, `Template with name "${template.name}" already exists`);
      }
      
      // Create the template
      const newTemplate = await storage.createTemplate(template);
      console.log("Template created successfully:", newTemplate.id);
      
      res.status(201).json({
        status: 'success',
        data: newTemplate,
        message: `Template "${newTemplate.name}" created successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid template data", 
          errors: error.errors,
          status: 'error',
          timestamp: new Date().toISOString()
        });
      }
      sendErrorResponse(res, 500, "Failed to create template", error);
    }
  });

  app.put("/api/templates/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const template = insertTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateTemplate(id, template);
      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid template data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  app.post("/api/templates/:id/activate", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.setActiveTemplate(id);
      if (!success) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json({ message: "Template activated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to activate template" });
    }
  });

  app.delete("/api/templates/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteTemplate(id);
      if (!success) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json({ message: "Template deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Log entries routes
  app.get("/api/logs", async (req, res) => {
    try {
      const templateId = req.query.templateId as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const logs = await storage.getLogEntries(templateId, limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch log entries" });
    }
  });

  app.post("/api/logs", async (req, res) => {
    try {
      const logEntry = insertLogEntrySchema.parse(req.body);
      const newEntry = await storage.createLogEntry(logEntry);
      res.json(newEntry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid log entry data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create log entry" });
    }
  });

  app.post("/api/logs/query", async (req, res) => {
    try {
      const { templateId, query } = req.body;
      const results = await storage.queryLogEntries(templateId, query);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to query log entries" });
    }
  });

  // Settings routes
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const settings = insertSettingsSchema.partial().parse(req.body);
      const updated = await storage.updateSettings(settings);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Initialize default data
  app.post("/api/initialize", async (_req, res) => {
    try {
      // Create default billiards template
      const existingTemplate = await storage.getActiveTemplate();
      if (!existingTemplate) {
        const billiardsTemplate = await storage.createTemplate({
          name: "Billiards League",
          description: "Pool/billiards game logging",
          logFormat: "Round [#] / Table [#] / Game [#] - [Player] [Action], [Player] [Action]",
          queryFormat: "Who [Action] on Round [#] / Table [#] / Game [#]",
          fields: [
            { name: "round", type: "number", required: true },
            { name: "table", type: "number", required: true },
            { name: "game", type: "number", required: true },
            { name: "players", type: "array", required: true },
            { name: "actions", type: "array", required: true }
          ],
          isActive: true,
        });

        // Create default settings
        await storage.updateSettings({
          activationPhrase: "Hey M",
          voiceResponseEnabled: true,
          confidenceThreshold: 80,
          currentTemplateId: billiardsTemplate.id,
        });
      }

      res.json({ message: "Application initialized successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize application" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
