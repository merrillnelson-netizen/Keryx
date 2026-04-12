import { db } from "./db";
import { storage } from "./storage";
import { people, logEntries, messages, aiActions } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

export type VelocityTier = "high" | "medium" | "acquaintance";

const TIER_30_DAY_HIGH = 5;
const TIER_30_DAY_MEDIUM_MIN = 1;
const DECAY_WINDOW_DAYS = 30;
const BIWEEKLY_WINDOW_DAYS = 90;
const DUPLICATE_WINDOW_DAYS = 30;

function isCloseRelationship(relationship: string | null | undefined): boolean {
  if (!relationship) return false;
  const rel = relationship.toLowerCase();
  return rel === "family" || rel === "partner";
}

/**
 * Compute a decay-weighted score from timestamped mention dates.
 * Mentions closer to today get a weight of 1.0; mentions 30 days ago get ~0.37 (exp decay).
 * This produces a float "decay score" that reflects both recency and frequency.
 */
function computeDecayScore(mentionDates: Date[], nowMs: number): number {
  let score = 0;
  const decayConstantMs = DECAY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  for (const d of mentionDates) {
    const ageMs = nowMs - d.getTime();
    score += Math.exp(-ageMs / decayConstantMs);
  }
  return score;
}

/**
 * Check whether there is a steady bi-weekly pattern in the last 90 days.
 * We split the 90-day window into 6 bi-weekly buckets and check whether
 * at least 4 of the 6 buckets contain at least one mention.
 */
function hasBiweeklyPattern(mentionDates: Date[], nowMs: number): boolean {
  const BUCKET_COUNT = 6;
  const BUCKET_SIZE_MS = (BIWEEKLY_WINDOW_DAYS / BUCKET_COUNT) * 24 * 60 * 60 * 1000;
  const windowStart = nowMs - BIWEEKLY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const buckets = new Array<boolean>(BUCKET_COUNT).fill(false);

  for (const d of mentionDates) {
    const ageMs = nowMs - d.getTime();
    if (ageMs > BIWEEKLY_WINDOW_DAYS * 24 * 60 * 60 * 1000) continue;
    const bucketIndex = Math.min(
      BUCKET_COUNT - 1,
      Math.floor((nowMs - d.getTime()) / BUCKET_SIZE_MS)
    );
    buckets[bucketIndex] = true;
  }

  const filledBuckets = buckets.filter(Boolean).length;
  return filledBuckets >= 4;
}

function computeTier(
  recentMentionCount: number,
  relationship: string | null | undefined,
  decayScore: number,
  hasBiweekly: boolean
): VelocityTier {
  // Zero mentions in the 30-day window always means Acquaintance regardless of
  // any historical pattern or decay score. This is an explicit spec requirement.
  if (recentMentionCount === 0) return "acquaintance";
  // ≥5 recent mentions → High (or family/partner with any recent activity)
  if (recentMentionCount >= TIER_30_DAY_HIGH) return "high";
  if (isCloseRelationship(relationship)) return "high";
  // 1–4 recent mentions → Medium (the 30-day count is decisive here).
  // biweekly pattern and decay score provide additional signals that can
  // confirm Medium or, if recentMentionCount were ever fractional (future),
  // resolve ambiguous edge cases — but with integer counts they reinforce
  // the same Medium outcome for recentMentionCount 1–4.
  if (recentMentionCount >= TIER_30_DAY_MEDIUM_MIN) return "medium";
  if (hasBiweekly) return "medium";
  if (decayScore >= 0.5) return "medium";
  return "acquaintance";
}

export async function runVelocityRecalculation(): Promise<{
  processed: number;
  tiersChanged: number;
  pendingActionsCreated: number;
}> {
  console.log("[velocity] Starting velocity recalculation...");

  const nowMs = Date.now();
  const cutoff30 = new Date(nowMs - DECAY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const cutoff90 = new Date(nowMs - BIWEEKLY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const allUsers = await db
    .selectDistinct({ userId: people.userId })
    .from(people);

  let processed = 0;
  let tiersChanged = 0;
  let pendingActionsCreated = 0;

  for (const { userId } of allUsers) {
    try {
      const userPeople = await storage.getPeople(userId);
      if (userPeople.length === 0) continue;

      for (const person of userPeople) {
        const allNames = [person.name, ...(person.aliases || [])];

        const memNameConditions = allNames.map(
          (n) => sql`${n} = ANY(${logEntries.detectedPeople})`
        );
        const memNameCondition =
          memNameConditions.length === 1
            ? memNameConditions[0]
            : sql`(${sql.join(memNameConditions, sql` OR `)})`;

        const [recent30MemResult, past90MemResult] = await Promise.all([
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(logEntries)
            .where(and(eq(logEntries.userId, userId), gte(logEntries.timestamp, cutoff30), memNameCondition)),
          db
            .select({ timestamp: logEntries.timestamp })
            .from(logEntries)
            .where(and(eq(logEntries.userId, userId), gte(logEntries.timestamp, cutoff90), memNameCondition)),
        ]);

        const memoryCount30 = recent30MemResult[0]?.count ?? 0;
        const mem90Dates = past90MemResult.map((r) => r.timestamp);

        let messageCount30 = 0;
        let msg90Dates: Date[] = [];

        try {
          const msgNameConditions = allNames.map(
            (n) => sql`${n} = ANY(${messages.detectedPeople})`
          );
          const msgNameCondition =
            msgNameConditions.length === 1
              ? msgNameConditions[0]
              : sql`(${sql.join(msgNameConditions, sql` OR `)})`;

          const [recent30MsgResult, past90MsgResult] = await Promise.all([
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(messages)
              .where(and(eq(messages.userId, userId), gte(messages.timestamp, cutoff30), msgNameCondition)),
            db
              .select({ timestamp: messages.timestamp })
              .from(messages)
              .where(and(eq(messages.userId, userId), gte(messages.timestamp, cutoff90), msgNameCondition)),
          ]);

          messageCount30 = recent30MsgResult[0]?.count ?? 0;
          msg90Dates = past90MsgResult.map((r) => r.timestamp);
        } catch (msgErr) {
          console.warn(`[velocity] Could not count messages for person ${person.id} (${person.name}):`, msgErr instanceof Error ? msgErr.message : msgErr);
        }

        const recentTotal = memoryCount30 + messageCount30;
        const all90Dates = [...mem90Dates, ...msg90Dates];

        const decayScore = computeDecayScore(all90Dates, nowMs);
        const biweekly = hasBiweeklyPattern(all90Dates, nowMs);

        const newTier = computeTier(recentTotal, person.relationship, decayScore, biweekly);
        const prevTier = (person.velocityTier as VelocityTier | null) ?? null;

        const tierChanged = prevTier !== null && prevTier !== newTier;

        await db
          .update(people)
          .set({
            recentMentionCount: recentTotal,
            previousVelocityTier: person.velocityTier ?? null,
            velocityTier: newTier,
          })
          .where(and(eq(people.userId, userId), eq(people.id, person.id)));

        processed++;

        if (tierChanged && tierDropped(prevTier!, newTier)) {
          tiersChanged++;

          const hasDuplicate = await hasDuplicateRecentAudit(userId, person.id);
          if (!hasDuplicate) {
            await storage.createAiAction({
              userId,
              actionType: "person_decay_audit",
              actionCategory: "people",
              sourceType: "memory",
              sourceId: person.id,
              sourceText: null,
              title: `Relationship check: ${person.name}`,
              description: `I noticed you haven't mentioned ${person.name} lately. Should I lower their priority in your dashboard?`,
              payload: {
                personId: person.id,
                personName: person.name,
                previousTier: prevTier,
                newTier,
                recentMentionCount: recentTotal,
                decayScore: Math.round(decayScore * 100) / 100,
              },
              status: "pending",
              aiReasoning: `Velocity tier dropped from ${prevTier} to ${newTier} — ${recentTotal} mention(s) in the last 30 days (decay score: ${decayScore.toFixed(2)}).`,
              confidence: 0.85,
              rollbackAvailable: false,
              rollbackData: null,
              resultData: null,
              errorMessage: null,
              expiresAt: null,
            });
            pendingActionsCreated++;
          }
        }
      }
    } catch (err) {
      console.error(`[velocity] Error processing user ${userId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `[velocity] Done — processed=${processed} tiersChanged=${tiersChanged} pendingActionsCreated=${pendingActionsCreated}`
  );

  return { processed, tiersChanged, pendingActionsCreated };
}

function tierDropped(prev: VelocityTier, current: VelocityTier): boolean {
  const order: Record<VelocityTier, number> = { high: 2, medium: 1, acquaintance: 0 };
  return order[current] < order[prev];
}

/**
 * Returns true if any decay audit action (in any status) was created for this person
 * within the last DUPLICATE_WINDOW_DAYS days. Prevents rapid re-creation after
 * the user approves or rejects a card.
 */
async function hasDuplicateRecentAudit(userId: string, personId: string): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: aiActions.id })
      .from(aiActions)
      .where(
        and(
          eq(aiActions.userId, userId),
          eq(aiActions.actionType, "person_decay_audit"),
          eq(aiActions.sourceId, personId),
          gte(aiActions.createdAt, cutoff)
        )
      )
      .limit(1);
    return existing.length > 0;
  } catch {
    return false;
  }
}

export function startVelocityScheduler(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;

  runVelocityRecalculation().catch((err) =>
    console.error("[velocity] Initial run failed:", err)
  );

  setInterval(() => {
    runVelocityRecalculation().catch((err) =>
      console.error("[velocity] Scheduled run failed:", err)
    );
  }, INTERVAL_MS);
}
