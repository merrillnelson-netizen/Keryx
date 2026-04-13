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
 */

import { storage } from "./storage";
import { db } from "./db";
import { aiActions, people, goals } from "@shared/schema";
import { eq, and, gte, lte, isNull, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { AI_ACTION_TYPES, AI_ACTION_CATEGORIES, AI_ACTION_STATUSES } from "@shared/schema";

const DEDUP_WINDOW_DAYS = 7; // Don't re-create the same action type within 7 days
const REACH_OUT_MIN_PRIORITY = 7; // Only suggest reach-outs for priority 7+
const GOAL_STALE_DAYS = 7; // Goals with no update in 7+ days get a prompt
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
  created: { count: number }
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

      const sourceId = `goal_update_${goal.id}`;
      const hasDupe = await hasDuplicateRecentAction(
        userId,
        AI_ACTION_TYPES.GOAL_UPDATE,
        sourceId
      );
      if (hasDupe) continue;

      await storage.createAiAction({
        userId,
        actionType: AI_ACTION_TYPES.GOAL_UPDATE,
        actionCategory: AI_ACTION_CATEGORIES.GOALS,
        sourceType: "memory",
        sourceId,
        sourceText: null,
        title: `Update progress on "${goal.title}"`,
        description: `Your goal "${goal.title}" is at ${goal.progressPercent}% and hasn't been updated in ${GOAL_STALE_DAYS}+ days. Review if your recent activities show progress.`,
        payload: {
          goalId: goal.id,
          goalTitle: goal.title,
          currentProgress: goal.progressPercent,
          targetDate: goal.targetDate,
        },
        status: AI_ACTION_STATUSES.PENDING,
        aiReasoning: `Goal "${goal.title}" (${goal.progressPercent}% complete) has not been updated since ${staleThreshold.toLocaleDateString()}. A progress check-in keeps momentum.`,
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

/**
 * 3. INSIGHT SURFACE — Create insight.surface action cards from pattern alerts
 * Accepts pre-computed pattern alerts and stores notable ones as action proposals.
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

  const created = { count: 0 };

  // Only surface "negative" or "insight" patterns as proactive actions
  const actionable = patternAlerts.filter(
    (a) => a.type === "negative" || a.type === "insight"
  );

  for (const alert of actionable.slice(0, 2)) {
    if (created.count >= MAX_PROACTIVE_PER_RUN) break;

    const sourceId = `insight_${Buffer.from(alert.title).toString("base64").slice(0, 20)}`;
    const hasDupe = await hasDuplicateRecentAction(
      userId,
      AI_ACTION_TYPES.INSIGHT_SURFACE,
      sourceId,
      3 // shorter window for insights — they're time-sensitive
    );
    if (hasDupe) continue;

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
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
 */
export async function runProactiveAnalysis(userId: string): Promise<{
  actionsCreated: number;
}> {
  const created = { count: 0 };

  await Promise.allSettled([
    generateReachOutProposals(userId, created),
    generateGoalUpdateProposals(userId, created),
  ]);

  if (created.count > 0) {
    console.log(`[proactive] Created ${created.count} proactive action(s) for user ${userId.slice(0, 8)}`);
  }

  return { actionsCreated: created.count };
}
