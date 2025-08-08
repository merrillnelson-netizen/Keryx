import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTemplateSchema, insertLogEntrySchema, insertSettingsSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Templates routes
  app.get("/api/templates", async (_req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/active", async (_req, res) => {
    try {
      const template = await storage.getActiveTemplate();
      if (!template) {
        return res.status(404).json({ message: "No active template found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active template" });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const template = insertTemplateSchema.parse(req.body);
      const newTemplate = await storage.createTemplate(template);
      res.json(newTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid template data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create template" });
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
