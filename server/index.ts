import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import passport from "./auth";
import { pool } from "./db";
import { storage } from "./storage";
import { processMessageBatch } from "./message-ai-service";
import { sendPushToAllUserDevices } from "./push-service";
import { handleWebhookEvent } from "./stripe-service";
import { getStripeSync } from "./stripe-client";

/**
 * Validate required environment variables on startup
 * Exits process if critical variables are missing
 */
function validateEnvironment() {
  const required = ['SESSION_SECRET', 'DATABASE_URL'];
  const missing: string[] = [];

  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Check for OpenAI API key (either Replit AI Integration or direct key)
  const hasOpenAIKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!hasOpenAIKey) {
    missing.push('OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY)');
  }

  if (missing.length > 0) {
    console.error(`\n❌ CRITICAL: Missing required environment variables: ${missing.join(', ')}. Set them before starting the application.\n`);
    process.exit(1);
  }

  console.log('✅ All required environment variables are configured');
}

// Validate environment before initializing app
validateEnvironment();

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Stripe webhook must use raw body parser — registered BEFORE express.json()
// stripe-replit-sync manages the webhook secret automatically via findOrCreateManagedWebhook
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }
  try {
    await handleWebhookEvent(req.body as Buffer, sig);
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(400).json({ error: `Webhook error: ${err instanceof Error ? err.message : 'Unknown error'}` });
  }
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.set('trust proxy', 1);

// Session configuration with PostgreSQL store
const PgSession = connectPgSimple(session);
const sessionStore = new PgSession({
  pool: pool,
  tableName: "session",
  createTableIfMissing: true,
});

// Log session store errors
sessionStore.on('error', (error) => {
  console.error('Session store error:', error);
});

app.use(
  session({
    store: sessionStore,
    // SESSION_SECRET is validated on startup - no fallback for security
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === "production",
      httpOnly: true, // Prevent JavaScript access to session cookie
      sameSite: 'lax', // CSRF protection, allows cookies on same-site navigation
    },
  })
);

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const status = capturedJsonResponse.status || '';
        const cached = capturedJsonResponse.cached ? ' [cached]' : '';
        if (status) logLine += ` :: ${status}${cached}`;
      }

      if (logLine.length > 120) {
        logLine = logLine.slice(0, 119) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize Stripe schema, managed webhook, and backfill sync
  // Runs in background — does not block server startup
  (async () => {
    try {
      const { runMigrations } = await import('stripe-replit-sync');
      await runMigrations({ databaseUrl: process.env.DATABASE_URL! });
      log('[stripe] Schema migrations complete');

      const stripeSync = await getStripeSync();
      const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
      if (domain) {
        const webhook = await stripeSync.findOrCreateManagedWebhook(
          `https://${domain}/api/stripe/webhook`
        );
        log(`[stripe] Managed webhook active: ${webhook?.url ?? 'configured'}`);
      }

      stripeSync.syncBackfill()
        .then(() => log('[stripe] Backfill sync complete'))
        .catch((err: any) => console.error('[stripe] Backfill sync error (non-fatal):', err));
    } catch (err) {
      console.warn('[stripe] Initialization skipped (Stripe not yet connected):', err instanceof Error ? err.message : err);
    }
  })();

  // Early access: when billing is not enforced, ensure all users have Life OS access
  // so the UI correctly reflects full feature availability. Remove once BILLING_ENFORCEMENT=true.
  if (process.env.BILLING_ENFORCEMENT !== 'true') {
    try {
      const upgradeResult = await pool.query(
        `UPDATE users SET subscription_tier = 'life_os', subscription_status = 'active' WHERE subscription_tier = 'free'`
      );
      if ((upgradeResult.rowCount ?? 0) > 0) {
        log(`[early-access] Upgraded ${upgradeResult.rowCount} free account(s) to Life OS tier`);
      }
    } catch (err) {
      console.error('[early-access] Tier upgrade (non-fatal):', err instanceof Error ? err.message : err);
    }
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('Express error handler:', err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    // ─── Reminder Daemon ─────────────────────────────────────────────────────
    log('[reminder-daemon] Started — polling every 60s');
    setInterval(async () => {
      try {
        const now = new Date();

        // 1. Fire due reminders (pending past their time, or snoozed past snooze time)
        const dueReminders = await storage.getAllDueReminders(now);
        for (const reminder of dueReminders) {
          try {
            await storage.triggerReminder(reminder.id, reminder.userId);
            const timeStr = reminder.triggerTime
              ? new Date(reminder.triggerTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
              : '';
            await sendPushToAllUserDevices(reminder.userId, {
              type: 'reminder',
              title: `⏰ ${reminder.content}`,
              body: timeStr ? `Scheduled for ${timeStr}` : 'Your reminder is due',
              url: '/reminders',
              requireInteraction: true,
              extraData: { reminderId: reminder.id },
              actions: [
                { action: 'done', title: 'Done ✓' },
                { action: 'snooze', title: 'Snooze 30m' },
              ],
            });
          } catch (err) {
            console.error(`[reminder-daemon] Failed to fire reminder ${reminder.id}:`, err);
          }
        }

        // 2. Send advance warnings for reminders due in the next 30 minutes
        const advanceReminders = await storage.getAdvanceWarningReminders(now, 30);
        for (const reminder of advanceReminders) {
          try {
            await sendPushToAllUserDevices(reminder.userId, {
              type: 'reminder',
              title: `🔔 Coming up: ${reminder.content}`,
              body: reminder.triggerTime
                ? `Due at ${new Date(reminder.triggerTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                : 'Due in about 30 minutes',
              url: '/reminders',
              requireInteraction: false,
            });
            await storage.markAdvanceNotified(reminder.id);
          } catch (err) {
            console.error(`[reminder-daemon] Failed to send advance warning for ${reminder.id}:`, err);
          }
        }
      } catch (err) {
        console.error('[reminder-daemon] Poll cycle error:', err);
      }
    }, 60 * 1000);
    // ─────────────────────────────────────────────────────────────────────────

    setTimeout(async () => {
      try {
        const backfillCheck = await pool.query(`SELECT COUNT(*) as cnt FROM people WHERE source = 'memory' AND EXISTS (SELECT 1 FROM messages m WHERE m.user_id = people.user_id AND people.name = ANY(m.detected_people))`);
        if (parseInt(backfillCheck.rows[0]?.cnt || '0', 10) > 0) {
          log('Startup: backfilling people source field...');
          await pool.query(`UPDATE people p SET source = 'messages' WHERE source = 'memory' AND EXISTS (SELECT 1 FROM messages m WHERE m.user_id = p.user_id AND p.name = ANY(m.detected_people)) AND NOT EXISTS (SELECT 1 FROM log_entries le WHERE le.user_id = p.user_id AND p.name = ANY(le.detected_people))`);
          await pool.query(`UPDATE people p SET source = 'both' WHERE source = 'memory' AND EXISTS (SELECT 1 FROM messages m WHERE m.user_id = p.user_id AND p.name = ANY(m.detected_people)) AND EXISTS (SELECT 1 FROM log_entries le WHERE le.user_id = p.user_id AND p.name = ANY(le.detected_people))`);
          log('Startup: people source backfill complete');
        }
      } catch (err) {
        console.error('Startup people source backfill failed (non-fatal):', err);
      }

      try {
        const phoneBackfill = await pool.query(`
          SELECT p.id as person_id, p.name as person_name, p.user_id,
                 mc.contact_address, mc.contact_name
          FROM people p
          JOIN message_conversations mc 
            ON mc.user_id = p.user_id 
            AND mc.contact_address = p.name
          WHERE p.phone_number IS NULL
            AND p.name ~ '^\\+?[0-9][0-9\\s\\-()]+$'
        `);
        if (phoneBackfill.rows.length > 0) {
          log(`Startup: backfilling ${phoneBackfill.rows.length} phone-number people records...`);
          for (const row of phoneBackfill.rows) {
            const newName = row.contact_name || row.contact_address;
            try {
              const existing = await pool.query(
                `SELECT id FROM people WHERE user_id = $1 AND name = $2 AND id != $3`,
                [row.user_id, newName, row.person_id]
              );
              if (existing.rows.length === 0) {
                await pool.query(
                  `UPDATE people SET phone_number = $1, name = $2 WHERE id = $3`,
                  [row.contact_address, newName, row.person_id]
                );
              } else {
                await pool.query(
                  `UPDATE people SET phone_number = $1 WHERE id = $2`,
                  [row.contact_address, row.person_id]
                );
              }
            } catch {
            }
          }

          const noConvoPhones = await pool.query(`
            UPDATE people SET phone_number = name
            WHERE phone_number IS NULL
              AND name ~ '^\\+?[0-9][0-9\\s\\-()]+$'
              AND NOT EXISTS (
                SELECT 1 FROM message_conversations mc 
                WHERE mc.user_id = people.user_id AND mc.contact_address = people.name
              )
          `);
          log(`Startup: phone-number people backfill complete (${phoneBackfill.rows.length} with convos, ${noConvoPhones.rowCount || 0} standalone)`);
        }
      } catch (err) {
        console.error('Startup phone-number people backfill failed (non-fatal):', err);
      }

      try {
        const allUsers = await pool.query('SELECT DISTINCT user_id FROM messages WHERE ai_processed = false');
        for (const row of allUsers.rows) {
          const userId = row.user_id;
          log(`Startup: processing unfinished messages for user ${userId.slice(0, 8)}...`);
          let retries = 0;
          while (retries < 3) {
            const batch = await storage.getUnprocessedMessages(userId, 50);
            if (batch.length === 0) break;
            try {
              await processMessageBatch(userId, batch);
              retries = 0;
            } catch (batchErr) {
              retries++;
              console.warn(`Startup message batch retry ${retries}/3 for user ${userId.slice(0, 8)}:`, batchErr instanceof Error ? batchErr.message : batchErr);
              if (retries < 3) await new Promise(r => setTimeout(r, 5000 * retries));
            }
          }
          await storage.invalidateAiCache(userId);
        }
        if (allUsers.rows.length > 0) {
          log(`Startup: message catch-up complete for ${allUsers.rows.length} user(s)`);
        }
      } catch (err) {
        console.error('Startup message processing catch-up failed:', err);
      }
    }, 10000);
  });
})();
