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
 * @param userTimezone IANA timezone string from settings.userTimezone (e.g. "America/Denver")
 */
export async function runProactiveAnalysis(userId: string, userTimezone: string = 'UTC'): Promise<{
  actionsCreated: number;
}> {
  const created = { count: 0 };

  await Promise.allSettled([
    generateReachOutProposals(userId, created),
    generateGoalUpdateProposals(userId, created, userTimezone),
  ]);

  if (created.count > 0) {
    console.log(`[proactive] Created ${created.count} proactive action(s) for user ${userId.slice(0, 8)}`);
  }

  return { actionsCreated: created.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DISCOVERY → ACTION BRIDGE
// After contextual discoveries are generated, scan each discovery's title +
// content for phrases that imply an actionable proposal (reach-out, schedule,
// follow-up, note). If the confidence threshold is met, queue an action card.
// ─────────────────────────────────────────────────────────────────────────────

/** Simple keyword patterns that signal an actionable opportunity in discovery text. */
const DISCOVERY_ACTION_PATTERNS: Array<{
  regex: RegExp;
  actionType: string;
  actionCategory: string;
  buildTitle: (discoveryTitle: string) => string;
  buildDescription: (discoveryTitle: string, discoveryUrl: string) => string;
  confidence: number;
}> = [
  {
    regex: /\bbirthday\b/i,
    actionType: AI_ACTION_TYPES.REMINDER_CREATE,
    actionCategory: AI_ACTION_CATEGORIES.REMINDER,
    buildTitle: (t) => `Birthday reminder from discovery: ${t.slice(0, 50)}`,
    buildDescription: (t, u) => `A discovery mentions a birthday. Consider sending a message. Source: ${u}`,
    confidence: 0.75,
  },
  {
    regex: /\breach\s+out\b|\bfollow[\s-]?up\b|\bcheck\s+in\b|\breconnect\b/i,
    actionType: AI_ACTION_TYPES.PEOPLE_REACH_OUT,
    actionCategory: AI_ACTION_CATEGORIES.PEOPLE,
    buildTitle: (t) => `Follow up — from discovery: ${t.slice(0, 50)}`,
    buildDescription: (t, u) => `A discovery suggests reaching out or following up. Source: ${u}`,
    confidence: 0.72,
  },
  {
    regex: /\bschedule\b|\bmeeting\b|\bappointment\b|\bbook\s+a\b/i,
    actionType: AI_ACTION_TYPES.REMINDER_CREATE,
    actionCategory: AI_ACTION_CATEGORIES.REMINDER,
    buildTitle: (t) => `Schedule something — from discovery: ${t.slice(0, 50)}`,
    buildDescription: (t, u) => `A discovery references scheduling. Consider adding a reminder. Source: ${u}`,
    confidence: 0.70,
  },
];

/**
 * After discoveries are generated, scan each one for action-triggering keywords.
 * Only runs when user hasn't disabled the relevant action type.
 * Throttled: at most 2 proposals per run, 7-day dedup per discovery.
 */
export async function generateDiscoveryActionProposals(
  userId: string,
  discoveries: Discovery[]
): Promise<number> {
  if (!discoveries || discoveries.length === 0) return 0;

  let created = 0;
  const MAX = 2;

  for (const discovery of discoveries) {
    if (created >= MAX) break;

    const searchText = `${discovery.title} ${discovery.content} ${discovery.insightContext}`;

    for (const pattern of DISCOVERY_ACTION_PATTERNS) {
      if (created >= MAX) break;
      if (!pattern.regex.test(searchText)) continue;

      // Dedup: one action per discovery per action type per 7 days
      const sourceId = `disc_${discovery.id}_${pattern.actionType}`;
      const hasDupe = await hasDuplicateRecentAction(userId, pattern.actionType, sourceId, 7);
      if (hasDupe) continue;

      // Respect user's action policy — skip if DISABLED
      const { getActionPolicy } = await import('./ai-actions-service');
      const { policy } = await getActionPolicy(userId, pattern.actionType);
      if (policy === 'disabled') continue;

      try {
        await storage.createAiAction({
          userId,
          actionType: pattern.actionType,
          actionCategory: pattern.actionCategory,
          sourceType: 'discovery',
          sourceId,
          sourceText: discovery.insightContext || discovery.title,
          title: pattern.buildTitle(discovery.title),
          description: pattern.buildDescription(discovery.title, discovery.url),
          payload: {
            discoveryId: discovery.id,
            discoveryTitle: discovery.title,
            discoveryUrl: discovery.url,
            insightContext: discovery.insightContext,
          },
          status: AI_ACTION_STATUSES.PENDING,
          aiReasoning: `Discovery "${discovery.title}" matched action pattern for ${pattern.actionType}`,
          confidence: pattern.confidence,
          rollbackAvailable: false,
          rollbackData: null,
          resultData: null,
          errorMessage: null,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
        });
        created++;
      } catch (err) {
        console.error('[proactive] Discovery action creation failed:', err instanceof Error ? err.message : err);
      }
      break; // Only one action per discovery
    }
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BRIEFING → ACTION PROPOSALS
// After a morning briefing is generated, scan focusAreas and reminders for
// actionable phrases. Queues proposals with sourceType = 'briefing'.
// ─────────────────────────────────────────────────────────────────────────────

/** Briefing text patterns that imply an actionable proposal */
const BRIEFING_ACTION_PATTERNS: Array<{
  regex: RegExp;
  actionType: string;
  actionCategory: string;
  buildTitle: (text: string) => string;
  confidence: number;
}> = [
  {
    regex: /\breach\s+out\s+to\s+(\w+)|\bcontact\s+(\w+)|\bcheck\s+in\s+with\s+(\w+)/i,
    actionType: AI_ACTION_TYPES.PEOPLE_REACH_OUT,
    actionCategory: AI_ACTION_CATEGORIES.PEOPLE,
    buildTitle: (text) => `Reach out — "${text.slice(0, 60)}"`,
    confidence: 0.80,
  },
  {
    regex: /\bschedule\b|\bset\s+up\s+a\s+(meeting|call|appointment)\b/i,
    actionType: AI_ACTION_TYPES.REMINDER_CREATE,
    actionCategory: AI_ACTION_CATEGORIES.REMINDER,
    buildTitle: (text) => `Schedule: "${text.slice(0, 60)}"`,
    confidence: 0.75,
  },
  {
    regex: /\bfollow[\s-]?up\b|\bdon['']t\s+forget\b|\bremember\s+to\b/i,
    actionType: AI_ACTION_TYPES.REMINDER_CREATE,
    actionCategory: AI_ACTION_CATEGORIES.REMINDER,
    buildTitle: (text) => `Follow up: "${text.slice(0, 60)}"`,
    confidence: 0.75,
  },
  {
    regex: /\bdraft\b|\bsend\s+(an?\s+)?(email|message|note)\b/i,
    actionType: AI_ACTION_TYPES.EMAIL_DRAFT,
    actionCategory: AI_ACTION_CATEGORIES.EMAIL,
    buildTitle: (text) => `Draft: "${text.slice(0, 60)}"`,
    confidence: 0.72,
  },
];

/**
 * Scan morning briefing focusAreas and reminders arrays for action triggers.
 * Creates pending action proposals with sourceType = 'briefing'.
 * Max 2 proposals per briefing to avoid noise.
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

  let created = 0;
  const MAX = 2;

  for (const item of items) {
    if (created >= MAX) break;

    for (const pattern of BRIEFING_ACTION_PATTERNS) {
      if (created >= MAX) break;
      if (!pattern.regex.test(item)) continue;

      // Dedup: one proposal per unique briefing item per action type per 24h
      const sourceId = `brief_${Buffer.from(item).toString('base64').slice(0, 24)}_${pattern.actionType}`;
      const hasDupe = await hasDuplicateRecentAction(userId, pattern.actionType, sourceId, 1);
      if (hasDupe) continue;

      // Respect user's action policy
      const { getActionPolicy } = await import('./ai-actions-service');
      const { policy } = await getActionPolicy(userId, pattern.actionType);
      if (policy === 'disabled') continue;

      try {
        await storage.createAiAction({
          userId,
          actionType: pattern.actionType,
          actionCategory: pattern.actionCategory,
          sourceType: 'briefing',
          sourceId,
          sourceText: item,
          title: pattern.buildTitle(item),
          description: `Suggested from your morning briefing: "${item}"`,
          payload: {
            briefingItem: item,
            actionable: true,
          },
          status: AI_ACTION_STATUSES.PENDING,
          aiReasoning: `Morning briefing item matched action pattern for ${pattern.actionType}: "${item}"`,
          confidence: pattern.confidence,
          rollbackAvailable: false,
          rollbackData: null,
          resultData: null,
          errorMessage: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
        created++;
      } catch (err) {
        console.error('[proactive] Briefing action creation failed:', err instanceof Error ? err.message : err);
      }
      break; // One action per item
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
