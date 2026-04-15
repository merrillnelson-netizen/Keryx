/**
 * Proactive Service — Task #43
 *
 * Scans user data for opportunities to propose helpful actions before the user asks.
 * Called after morning briefing generation and on a periodic schedule.
 *
 * Creates action proposals for:
 *  1. insight.surface  — notable patterns detected by AI
 *  2. people.reach_out — high-priority contacts with no recent interaction
 *  3. goal.update      — active goals that haven't had progress logged in a while
 *  4. discovery bridge — contextual discoveries that imply an actionable proposal
 *  5. briefing bridge  — focusAreas / reminders from morning briefings
 *  6. high-signal companion — people.note proposals paired with VIP alerts
 */

import { storage } from "./storage";
import { db } from "./db";
import { aiActions, people, goals } from "@shared/schema";
import { eq, and, gte, lte, isNull, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { AI_ACTION_TYPES, AI_ACTION_CATEGORIES, AI_ACTION_STATUSES } from "@shared/schema";
import { buildTemporalContext } from "./temporal-context";
import type { Discovery } from "./contextual-discoveries-service";

const DEDUP_WINDOW_DAYS = 7; // Don't re-create the same action type within 7 days
const REJECTION_SILENCE_DAYS = 30; // After a rejection, don't re-surface for 30 days
const REACH_OUT_MIN_PRIORITY = 7; // Only suggest reach-outs for priority 7+
const GOAL_STALE_DAYS = 14; // Goals with no update in 14+ days get a prompt (was 7)
const MAX_PROACTIVE_PER_RUN = 3; // Max new actions per run to avoid noise

/**
 * Check if a proactive action of a given type was already created recently
 * for the same user + source combination.
 */
async function hasDuplicateRecentAction(
  userId: string,
  actionType: string,
  sourceId: string,
  windowDays: number = DEDUP_WINDOW_DAYS
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: aiActions.id })
      .from(aiActions)
      .where(
        and(
          eq(aiActions.userId, userId),
          eq(aiActions.actionType, actionType),
          eq(aiActions.sourceId, sourceId),
          gte(aiActions.createdAt, cutoff)
        )
      )
      .limit(1);
    return existing.length > 0;
  } catch {
    return false;
  }
}

/**
 * Cross-source, cross-type check: is there already a pending OR recently-rejected
 * action that references a specific goalId in its payload?
 *
 * This prevents multiple generators (goal-checkin, discovery bridge, briefing bridge)
 * from all creating separate actions about the same goal in the same proactive run.
 *
 * - Pending actions: any age (block until the user resolves them)
 * - Rejected actions: blocked for REJECTION_SILENCE_DAYS (30 days by default)
 */
async function hasAnyGoalRelatedAction(
  userId: string,
  goalId: string,
  rejectionSilenceDays: number = REJECTION_SILENCE_DAYS
): Promise<boolean> {
  try {
    const rejectionCutoff = new Date(Date.now() - rejectionSilenceDays * 24 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: aiActions.id, status: aiActions.status, createdAt: aiActions.createdAt })
      .from(aiActions)
      .where(
        and(
          eq(aiActions.userId, userId),
          sql`(payload->>'goalId') = ${goalId}`
        )
      )
      .limit(10);

    for (const row of existing) {
      if (row.status === AI_ACTION_STATUSES.PENDING) return true; // still waiting on user
      if (
        row.status === AI_ACTION_STATUSES.REJECTED &&
        row.createdAt &&
        new Date(row.createdAt) > rejectionCutoff
      ) return true; // rejected within silence window
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Cross-source person dedup: is there already a pending OR recently-rejected
 * action that references a specific personId in its payload?
 */
async function hasAnyPersonRelatedAction(
  userId: string,
  personId: string,
  rejectionSilenceDays: number = REJECTION_SILENCE_DAYS
): Promise<boolean> {
  try {
    const rejectionCutoff = new Date(Date.now() - rejectionSilenceDays * 24 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: aiActions.id, status: aiActions.status, createdAt: aiActions.createdAt })
      .from(aiActions)
      .where(
        and(
          eq(aiActions.userId, userId),
          sql`(payload->>'personId') = ${personId}`
        )
      )
      .limit(10);

    for (const row of existing) {
      if (row.status === AI_ACTION_STATUSES.PENDING) return true;
      if (
        row.status === AI_ACTION_STATUSES.REJECTED &&
        row.createdAt &&
        new Date(row.createdAt) > rejectionCutoff
      ) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 1. PEOPLE — Reach-out proposals
 * Finds high-priority people with no recent mentions and creates `people.reach_out` cards.
 */
async function generateReachOutProposals(
  userId: string,
  created: { count: number }
): Promise<void> {
  if (created.count >= MAX_PROACTIVE_PER_RUN) return;

  try {
    const allPeople = await storage.getPeople(userId);
    // High-priority people with zero recent mentions (acquaintance tier = faded)
    const faded = allPeople.filter(
      (p) =>
        (p.priority ?? 0) >= REACH_OUT_MIN_PRIORITY &&
        p.velocityTier === "acquaintance" &&
        (p.recentMentionCount ?? 0) === 0
    );

    for (const person of faded) {
      if (created.count >= MAX_PROACTIVE_PER_RUN) break;

      const sourceId = `reach_out_${person.id}`;
      const hasDupe = await hasDuplicateRecentAction(
        userId,
        AI_ACTION_TYPES.PEOPLE_REACH_OUT,
        sourceId
      );
      if (hasDupe) continue;

      // Cross-source dedup: block if there's already a pending or recently-rejected
      // action about this person regardless of type/source
      const hasPersonAction = await hasAnyPersonRelatedAction(userId, person.id);
      if (hasPersonAction) continue;

      const daysSince = person.recentMentionCount === 0 ? "30+" : "several";
      await storage.createAiAction({
        userId,
        actionType: AI_ACTION_TYPES.PEOPLE_REACH_OUT,
        actionCategory: AI_ACTION_CATEGORIES.PEOPLE,
        sourceType: "memory",
        sourceId,
        sourceText: null,
        title: `Check in with ${person.name}`,
        description: `You haven't mentioned ${person.name} recently and they're marked as priority ${person.priority}. Consider reaching out.`,
        payload: {
          personId: person.id,
          personName: person.name,
          relationship: person.relationship,
          priority: person.priority,
          daysSinceContact: daysSince,
        },
        status: AI_ACTION_STATUSES.PENDING,
        aiReasoning: `${person.name} (priority ${person.priority}, ${person.relationship || "contact"}) has had 0 mentions in the last 30 days — velocity dropped to acquaintance tier.`,
        confidence: 0.8,
        rollbackAvailable: false,
        rollbackData: null,
        resultData: null,
        errorMessage: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      created.count++;
    }
  } catch (err) {
    console.error("[proactive] Reach-out proposal generation failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * 2. GOALS — Progress update proposals
 * Finds active goals that haven't been updated in GOAL_STALE_DAYS days.
 */
async function generateGoalUpdateProposals(
  userId: string,
  created: { count: number },
  userTimezone: string = 'UTC'
): Promise<void> {
  if (created.count >= MAX_PROACTIVE_PER_RUN) return;

  try {
    const allGoals = await storage.getGoals(userId);
    const staleThreshold = new Date(Date.now() - GOAL_STALE_DAYS * 24 * 60 * 60 * 1000);

    const staleGoals = allGoals.filter(
      (g) =>
        g.status === "active" &&
        g.progressPercent < 100 &&
        (!g.updatedAt || new Date(g.updatedAt) < staleThreshold)
    );

    for (const goal of staleGoals.slice(0, 2)) {
      if (created.count >= MAX_PROACTIVE_PER_RUN) break;

      const sourceId = `goal_checkin_${goal.id}`;
      // Same sourceId+type dedup (7-day window)
      const hasDupe = await hasDuplicateRecentAction(
        userId,
        AI_ACTION_TYPES.INSIGHT_SURFACE,
        sourceId
      );
      if (hasDupe) continue;

      // Cross-source dedup: block if ANY pending action OR rejected within 30 days
      // references this goalId in its payload (covers discovery + briefing bridges too)
      const hasGoalAction = await hasAnyGoalRelatedAction(userId, goal.id);
      if (hasGoalAction) continue;

      await storage.createAiAction({
        userId,
        actionType: AI_ACTION_TYPES.INSIGHT_SURFACE,
        actionCategory: AI_ACTION_CATEGORIES.GOALS,
        sourceType: "memory",
        sourceId,
        sourceText: null,
        title: `Goal check-in: "${goal.title}"`,
        description: `Your goal "${goal.title}" is at ${goal.progressPercent}% and hasn't been updated in ${GOAL_STALE_DAYS}+ days. Visit the Goals page to log your current progress, or mention your progress in a memory (e.g. "mark my ${goal.title} goal at 70%").`,
        payload: {
          goalId: goal.id,
          goalTitle: goal.title,
          currentProgress: goal.progressPercent,
          targetDate: goal.targetDate,
          summary: `"${goal.title}" is stale at ${goal.progressPercent}%. Update your progress in the Goals page.`,
          content: `Your goal "${goal.title}" hasn't been updated recently. Log a memory mentioning your progress, or go to the Goals page to update it directly.`,
        },
        status: AI_ACTION_STATUSES.PENDING,
        aiReasoning: `Goal "${goal.title}" (${goal.progressPercent}% complete) has not been updated since ${buildTemporalContext(userTimezone, staleThreshold).localDate}. A progress check-in keeps momentum.`,
        confidence: 0.75,
        rollbackAvailable: false,
        rollbackData: null,
        resultData: null,
        errorMessage: null,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });
      created.count++;
    }
  } catch (err) {
    console.error("[proactive] Goal update proposal generation failed:", err instanceof Error ? err.message : err);
  }
}

// Stop words to ignore when comparing insight topics
const INSIGHT_STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','has','have','had','be','been','being',
  'you','your','i','my','we','our','it','its','this','that','they','their',
  'from','by','as','up','out','if','about','so','just','than','then','also',
]);

/**
 * Extract meaningful topic keywords from an insight title + description.
 * Used to detect duplicate alerts about the same topic even when phrased differently.
 */
function extractTopicKeywords(title: string, description: string = ''): Set<string> {
  const text = `${title} ${description}`.toLowerCase();
  const words = text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  return new Set(words.filter(w => w.length > 3 && !INSIGHT_STOP_WORDS.has(w)));
}

/**
 * Check if a pending insight already covers the same topic as the proposed alert.
 * Returns true if there is ≥ 2 keyword overlap with any existing pending insight.
 */
async function hasSimilarPendingInsight(
  userId: string,
  title: string,
  description: string
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: aiActions.id, title: aiActions.title, description: aiActions.description })
      .from(aiActions)
      .where(
        and(
          eq(aiActions.userId, userId),
          eq(aiActions.actionType, AI_ACTION_TYPES.INSIGHT_SURFACE),
          or(
            eq(aiActions.status, AI_ACTION_STATUSES.PENDING),
            gte(aiActions.createdAt, cutoff)
          )
        )
      )
      .limit(20);

    const newKeywords = extractTopicKeywords(title, description);
    for (const row of existing) {
      const existingKeywords = extractTopicKeywords(row.title || '', row.description || '');
      let overlap = 0;
      for (const kw of newKeywords) {
        if (existingKeywords.has(kw)) overlap++;
      }
      if (overlap >= 2) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 3. INSIGHT SURFACE — Create insight.surface action cards from pattern alerts
 * Accepts pre-computed pattern alerts and stores notable ones as action proposals.
 * Guards against piling-on: caps pending insights at 2 and uses keyword dedup
 * to catch the same topic rephrased across multiple briefing runs.
 */
export async function createInsightSurfaceActions(
  userId: string,
  patternAlerts: Array<{
    type: string;
    title: string;
    description: string;
    actionSuggestion?: string;
  }>
): Promise<void> {
  if (!patternAlerts || patternAlerts.length === 0) return;

  // Hard cap: if the user already has 2+ pending insight cards, don't pile on
  try {
    const pendingInsights = await db
      .select({ id: aiActions.id })
      .from(aiActions)
      .where(
        and(
          eq(aiActions.userId, userId),
          eq(aiActions.actionType, AI_ACTION_TYPES.INSIGHT_SURFACE),
          eq(aiActions.status, AI_ACTION_STATUSES.PENDING)
        )
      )
      .limit(2);
    if (pendingInsights.length >= 2) return;
  } catch { /* proceed */ }

  const created = { count: 0 };

  // Only surface "negative" or "insight" patterns as proactive actions
  const actionable = patternAlerts.filter(
    (a) => a.type === "negative" || a.type === "insight"
  );

  for (const alert of actionable.slice(0, 2)) {
    if (created.count >= MAX_PROACTIVE_PER_RUN) break;

    // Primary dedup: exact sourceId match within 7 days
    const sourceId = `insight_${Buffer.from(alert.title).toString("base64").slice(0, 20)}`;
    const hasDupe = await hasDuplicateRecentAction(
      userId,
      AI_ACTION_TYPES.INSIGHT_SURFACE,
      sourceId,
      7 // extended to 7 days so same-topic alerts don't reappear in days following
    );
    if (hasDupe) continue;

    // Secondary dedup: keyword overlap catches the same topic with a different AI-generated title
    const hasSimilar = await hasSimilarPendingInsight(userId, alert.title, alert.description);
    if (hasSimilar) continue;

    try {
      await storage.createAiAction({
        userId,
        actionType: AI_ACTION_TYPES.INSIGHT_SURFACE,
        actionCategory: AI_ACTION_CATEGORIES.SYSTEM,
        sourceType: "briefing",
        sourceId,
        sourceText: null,
        title: alert.title,
        description: alert.description,
        payload: {
          alertType: alert.type,
          title: alert.title,
          description: alert.description,
          actionSuggestion: alert.actionSuggestion,
        },
        status: AI_ACTION_STATUSES.PENDING,
        aiReasoning: `Pattern alert surfaced from recent memory analysis: ${alert.title}`,
        confidence: 0.85,
        rollbackAvailable: false,
        rollbackData: null,
        resultData: null,
        errorMessage: null,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h expiry (was 24h)
      });
      created.count++;
    } catch (err) {
      console.error("[proactive] Insight surface creation failed:", err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Main entry point — run all proactive proposal generators for a user.
 * Called after morning briefing and on a daily schedule.
 * @param userTimezone IANA timezone string from settings.userTimezone (e.g. "America/Denver")
 */
export async function runProactiveAnalysis(userId: string, userTimezone: string = 'UTC'): Promise<{
  actionsCreated: number;
}> {
  const created = { count: 0 };

  await Promise.allSettled([
    generateReachOutProposals(userId, created),
    generateGoalUpdateProposals(userId, created, userTimezone),
    (async () => {
      try {
        const { generateObservations } = await import('./profile-observation-service');
        await generateObservations(userId);
      } catch (e) {
        console.error('[proactive] profile observations error:', e);
      }
    })(),
  ]);

  if (created.count > 0) {
    console.log(`[proactive] Created ${created.count} proactive action(s) for user ${userId.slice(0, 8)}`);
  }

  return { actionsCreated: created.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DISCOVERY → ACTION BRIDGE
// After contextual discoveries are generated, pass each discovery's text
// through processUserInputForActions (the AI detection pipeline). Only create
// proposals when detected confidence ≥ 0.7 and action type is not DISABLED.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_ACTION_CONFIDENCE = 0.7;

/**
 * After discoveries are generated, pass each discovery's summary text through
 * the AI action-detection pipeline. Proposals are queued with sourceType='discovery'.
 * Throttled: at most 2 proposals per run, 7-day dedup per discovery ID.
 */
export async function generateDiscoveryActionProposals(
  userId: string,
  discoveries: Discovery[]
): Promise<number> {
  if (!discoveries || discoveries.length === 0) return 0;

  const { processUserInputForActions } = await import('./ai-actions-service');
  let created = 0;
  const MAX = 2;

  for (const discovery of discoveries) {
    if (created >= MAX) break;

    // Build a natural-language summary of the discovery for action detection
    const inputText = `${discovery.insightContext ? discovery.insightContext + '. ' : ''}${discovery.title}. ${discovery.content?.slice(0, 200) || ''}`;

    // Dedup check: skip if ANY action from this discovery was created recently
    let alreadyExists = false;
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { db } = await import('./db');
      const { aiActions } = await import('@shared/schema');
      const { and, eq, gte, like } = await import('drizzle-orm');
      const existing = await db
        .select({ id: aiActions.id })
        .from(aiActions)
        .where(and(eq(aiActions.userId, userId), like(aiActions.sourceId, `disc_${discovery.id}%`), gte(aiActions.createdAt, cutoff)))
        .limit(1);
      alreadyExists = existing.length > 0;
    } catch { /* ignore */ }
    if (alreadyExists) continue;

    try {
      const result = await processUserInputForActions(
        userId,
        inputText,
        'discovery',
        `disc_${discovery.id}`,
        undefined,
        MIN_ACTION_CONFIDENCE,
      );

      if (result.actionDetected && result.action) {
        // Post-creation cross-source dedup: if a goal action was just created but
        // there's already another pending/rejected action about the same goal, cancel it
        const payload = result.action.payload as Record<string, unknown> | null;
        const goalId = payload?.goalId as string | undefined;
        if (goalId) {
          const dupCount = await db
            .select({ id: aiActions.id })
            .from(aiActions)
            .where(and(
              eq(aiActions.userId, userId),
              eq(aiActions.status, AI_ACTION_STATUSES.PENDING),
              sql`(payload->>'goalId') = ${goalId}`,
              sql`id != ${result.action.id}`
            ))
            .limit(1);
          if (dupCount.length > 0) {
            // Cancel the just-created action — there's already one pending
            await storage.updateAiAction(result.action.id, userId, { status: AI_ACTION_STATUSES.CANCELLED });
            console.log(`[proactive] Cancelled duplicate discovery goal action for goalId=${goalId}`);
            continue;
          }
        }
        created++;
      }
    } catch (err) {
      console.error('[proactive] Discovery action detection failed:', err instanceof Error ? err.message : err);
    }
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BRIEFING → ACTION PROPOSALS
// After a morning briefing is generated, pass each focusArea and reminder
// through processUserInputForActions (the same AI detection pipeline).
// Proposals are queued with sourceType = 'briefing'.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan morning briefing focusAreas and reminders arrays for actionable suggestions.
 * Each item is passed through the AI action-detection pipeline.
 * Creates pending action proposals with sourceType = 'briefing'.
 * Max 2 proposals per briefing. Policy-gated via processUserInputForActions.
 */
export async function generateBriefingActionProposals(
  userId: string,
  briefing: {
    focusAreas?: string[];
    reminders?: string[];
    summary?: string;
  }
): Promise<number> {
  const items = [
    ...(briefing.focusAreas || []),
    ...(briefing.reminders || []),
  ].filter(Boolean);

  if (items.length === 0) return 0;

  const { processUserInputForActions } = await import('./ai-actions-service');
  let created = 0;
  const MAX = 2;

  for (const item of items) {
    if (created >= MAX) break;

    // Dedup: skip if a briefing action from this exact item text was created within 24h
    const itemKey = `brief_${Buffer.from(item).toString('base64').slice(0, 24)}`;
    let alreadyExists = false;
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { db } = await import('./db');
      const { aiActions } = await import('@shared/schema');
      const { and, eq, gte, like } = await import('drizzle-orm');
      const existing = await db
        .select({ id: aiActions.id })
        .from(aiActions)
        .where(and(eq(aiActions.userId, userId), like(aiActions.sourceId, `${itemKey}%`), gte(aiActions.createdAt, cutoff)))
        .limit(1);
      alreadyExists = existing.length > 0;
    } catch { /* ignore */ }
    if (alreadyExists) continue;

    try {
      const result = await processUserInputForActions(
        userId,
        item,
        'briefing',
        itemKey,
        undefined,
        MIN_ACTION_CONFIDENCE,
      );

      if (result.actionDetected && result.action) {
        // Post-creation cross-source dedup: if a goal action was just created but
        // there's already another pending action about the same goal, cancel it
        const payload = result.action.payload as Record<string, unknown> | null;
        const goalId = payload?.goalId as string | undefined;
        if (goalId) {
          const dupCount = await db
            .select({ id: aiActions.id })
            .from(aiActions)
            .where(and(
              eq(aiActions.userId, userId),
              eq(aiActions.status, AI_ACTION_STATUSES.PENDING),
              sql`(payload->>'goalId') = ${goalId}`,
              sql`id != ${result.action.id}`
            ))
            .limit(1);
          if (dupCount.length > 0) {
            await storage.updateAiAction(result.action.id, userId, { status: AI_ACTION_STATUSES.CANCELLED });
            console.log(`[proactive] Cancelled duplicate briefing goal action for goalId=${goalId}`);
            continue;
          }
        }
        created++;
      }
    } catch (err) {
      console.error('[proactive] Briefing action detection failed:', err instanceof Error ? err.message : err);
    }
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. HIGH-SIGNAL COMPANION PROPOSALS
// When a high-signal alert fires for a VIP person, also create a people.note
// action so the user can immediately capture context about what they saw.
// ─────────────────────────────────────────────────────────────────────────────

export interface HighSignalCompanionInput {
  person: {
    id: string;
    name: string;
    priority: number;
    relationship?: string | null;
  };
  discovery: {
    id: string;
    title: string;
    url: string;
    content: string;
  };
  confidence: number;
}

/**
 * Create a companion people.note proposal for each high-signal alert.
 * Throttled: at most 1 note per person per 7 days.
 */
export async function createHighSignalCompanionProposals(
  userId: string,
  alerts: HighSignalCompanionInput[]
): Promise<number> {
  if (!alerts || alerts.length === 0) return 0;

  let created = 0;

  for (const alert of alerts.slice(0, 2)) {
    const sourceId = `hs_note_${alert.person.id}`;
    const hasDupe = await hasDuplicateRecentAction(userId, AI_ACTION_TYPES.PEOPLE_NOTE, sourceId, 7);
    if (hasDupe) continue;

    // Respect policy
    const { getActionPolicy } = await import('./ai-actions-service');
    const { policy } = await getActionPolicy(userId, AI_ACTION_TYPES.PEOPLE_NOTE);
    if (policy === 'disabled') continue;

    try {
      await storage.createAiAction({
        userId,
        actionType: AI_ACTION_TYPES.PEOPLE_NOTE,
        actionCategory: AI_ACTION_CATEGORIES.PEOPLE,
        sourceType: 'high_signal',
        sourceId,
        sourceText: `${alert.person.name} mentioned in: "${alert.discovery.title}"`,
        title: `Add note about ${alert.person.name}`,
        description: `${alert.person.name} was mentioned in a discovery ("${alert.discovery.title}"). Capture any context while it's fresh.`,
        payload: {
          personName: alert.person.name,
          note: `Mentioned in discovery: "${alert.discovery.title}" — ${alert.discovery.url}`,
          discoveryId: alert.discovery.id,
          discoveryTitle: alert.discovery.title,
          discoveryUrl: alert.discovery.url,
        },
        status: AI_ACTION_STATUSES.PENDING,
        aiReasoning: `High-signal alert: ${alert.person.name} (priority ${alert.person.priority}) matched discovery "${alert.discovery.title}" with confidence ${Math.round(alert.confidence * 100)}%`,
        confidence: alert.confidence,
        rollbackAvailable: false,
        rollbackData: null,
        resultData: null,
        errorMessage: null,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      created++;
    } catch (err) {
      console.error('[proactive] High-signal companion creation failed:', err instanceof Error ? err.message : err);
    }
  }

  return created;
}
