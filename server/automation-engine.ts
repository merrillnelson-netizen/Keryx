/**
 * Automation Rules Engine
 * Evaluates IFTTT-style rules and executes their actions.
 *
 * Trigger flow:
 *   1. An event occurs in the app (memory logged, mood dropped, etc.)
 *   2. Caller invokes `fireTrigger(userId, triggerType, context)`
 *   3. Engine fetches all enabled rules for that trigger
 *   4. For each rule: evaluate conditions against context, enforce daily run limit
 *   5. Execute the action (non-blocking via setImmediate)
 *   6. Record execution result
 */

import { storage } from './storage';
import { AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS, type AutomationRule } from '@shared/schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TriggerContext {
  // Shared
  userId: string;
  timestamp?: Date;
  // memory.logged — raw fields
  memoryContent?: string;
  moodScore?: number;        // 1-10
  topics?: string[];
  peopleNames?: string[];
  // memory.logged — AI-derived enriched fields
  aiTopics?: string[];       // AI-extracted topic tags (same as topics, explicit alias for conditions)
  aiPeople?: string[];       // AI-detected people (same as peopleNames, explicit alias)
  aiMoodLabel?: string;      // Human label derived from moodScore: 'great'|'good'|'neutral'|'low'|'bad'
  aiSentiment?: 'positive' | 'neutral' | 'negative'; // Coarse sentiment derived from moodScore
  // keyword.detected
  keyword?: string;
  // person.mentioned
  personName?: string;
  // goal.updated
  goalId?: string;
  goalTitle?: string;
  progressPercent?: number;
  // action.completed
  actionType?: string;
  actionTitle?: string;
  // briefing.generated
  briefingSummary?: string;
  // reminder.due
  reminderId?: string;
  reminderContent?: string;
  // daily.schedule
  localHour?: number; // 0-23
}

export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  skipped?: string; // reason if not triggered
  success?: boolean;
  error?: string;
}

// ─── Condition Evaluator ─────────────────────────────────────────────────────

/**
 * Checks whether the trigger context satisfies the rule's conditions.
 * Conditions are stored as a JSONB object. All specified conditions must match.
 */
function evaluateConditions(conditions: any, ctx: TriggerContext): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  // Mood thresholds
  if (conditions.moodBelow !== undefined && ctx.moodScore !== undefined) {
    if (ctx.moodScore >= conditions.moodBelow) return false;
  }
  if (conditions.moodAbove !== undefined && ctx.moodScore !== undefined) {
    if (ctx.moodScore <= conditions.moodAbove) return false;
  }

  // Keyword match — word-boundary aware (handles inflections like stress→stressed)
  // Falls back to substring match for multi-word phrases or special characters.
  if (conditions.keyword) {
    const kw = String(conditions.keyword).trim();
    const isSimpleWord = /^[a-zA-Z0-9'-]+$/.test(kw);
    const matchText = (haystack: string): boolean => {
      const h = haystack.toLowerCase();
      const k = kw.toLowerCase();
      if (isSimpleWord) {
        // Word-boundary regex: "stress" matches "stressed", "stressful" but not "distress"
        return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(haystack);
      }
      // Phrase or special chars: fall back to substring
      return h.includes(k);
    };
    if (ctx.memoryContent && !matchText(ctx.memoryContent)) return false;
    if (!ctx.memoryContent && ctx.keyword && !matchText(ctx.keyword)) return false;
  }

  // Person name match
  if (conditions.personName) {
    const target = String(conditions.personName).toLowerCase();
    const mentioned = (ctx.peopleNames || []).map(n => n.toLowerCase());
    if (!mentioned.some(n => n.includes(target) || target.includes(n))) return false;
  }

  // Topic match (raw ctx.topics)
  if (conditions.topic) {
    const target = String(conditions.topic).toLowerCase();
    const topics = (ctx.topics || []).map(t => t.toLowerCase());
    if (!topics.some(t => t.includes(target) || target.includes(t))) return false;
  }

  // AI Topic match — uses ctx.aiTopics (explicit AI-extracted alias)
  if (conditions.aiTopic) {
    const target = String(conditions.aiTopic).toLowerCase();
    const aiTopics = (ctx.aiTopics || ctx.topics || []).map(t => t.toLowerCase());
    // Fail if the AI topic data is absent in context (avoids pass-through)
    if (aiTopics.length === 0 && !ctx.topics?.length) return false;
    if (!aiTopics.some(t => t.includes(target) || target.includes(t))) return false;
  }

  // AI Sentiment match — explicit fail when ctx.aiSentiment is absent but condition specifies it
  if (conditions.aiSentiment) {
    if (!ctx.aiSentiment) return false;
    if (ctx.aiSentiment !== String(conditions.aiSentiment).toLowerCase()) return false;
  }

  // Progress threshold (for goal triggers)
  if (conditions.progressAbove !== undefined && ctx.progressPercent !== undefined) {
    if (ctx.progressPercent <= conditions.progressAbove) return false;
  }
  if (conditions.progressBelow !== undefined && ctx.progressPercent !== undefined) {
    if (ctx.progressPercent >= conditions.progressBelow) return false;
  }

  // Time of day (for daily.schedule trigger)
  if (conditions.atHour !== undefined && ctx.localHour !== undefined) {
    if (ctx.localHour !== conditions.atHour) return false;
  }

  // Action type filter (for action.completed trigger)
  if (conditions.actionType && ctx.actionType) {
    if (ctx.actionType !== conditions.actionType) return false;
  }

  return true;
}

// ─── Action Executors ─────────────────────────────────────────────────────────

async function executeRuleAction(rule: AutomationRule, ctx: TriggerContext): Promise<void> {
  // actionPayload is stored as a JSONB object; access fields via index signature
  const payload = (rule.actionPayload ?? {}) as Record<string, unknown>;

  switch (rule.actionType) {
    case AUTOMATION_ACTIONS.SEND_NOTIFICATION: {
      const { isPushConfigured, sendPushToAllUserDevices } = await import('./push-service');
      if (isPushConfigured()) {
        await sendPushToAllUserDevices(ctx.userId, {
          type: 'alert',
          title: (payload.title as string) || rule.name,
          body: interpolate((payload.body as string) || '', ctx),
          url: (payload.url as string) || '/',
        });
      }
      break;
    }

    case AUTOMATION_ACTIONS.CREATE_REMINDER: {
      const dueAt = payload.minutesFromNow
        ? new Date(Date.now() + Number(payload.minutesFromNow) * 60_000)
        : payload.dueAt
          ? new Date(payload.dueAt as string)
          : new Date(Date.now() + 60 * 60_000); // default 1 hour

      // InsertReminder omits: id, userId, status, snoozedUntil, snoozeCount,
      // triggeredAt, completedAt, advanceNotifiedAt, createdAt — no priority field
      await storage.createReminder(ctx.userId, {
        content: interpolate((payload.content as string) || rule.name, ctx),
        triggerTime: dueAt,
        triggerType: 'time',
      });
      break;
    }

    case AUTOMATION_ACTIONS.CREATE_AI_ACTION: {
      // InsertAiAction requires: userId, actionType, actionCategory, sourceType, title, payload, status
      await storage.createAiAction({
        userId: ctx.userId,
        actionType: (payload.actionType as string) || 'INSIGHT_SURFACE',
        actionCategory: (payload.category as string) || 'SYSTEM',
        sourceType: 'automation_rule',
        sourceId: `rule:${rule.id}`,
        title: interpolate((payload.title as string) || rule.name, ctx),
        description: interpolate((payload.description as string) || '', ctx),
        payload: (payload.actionData as object) || {},
        aiReasoning: `Automation rule "${rule.name}" triggered this action.`,
        confidence: (payload.confidence as number) ?? 0.8,
        status: 'pending',
        rollbackAvailable: false,
        rollbackData: null,
        resultData: null,
        errorMessage: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      break;
    }

    case AUTOMATION_ACTIONS.LOG_MEMORY: {
      const { extractMetadata } = await import('./ai-service');
      const content = interpolate((payload.content as string) || 'Automated log entry', ctx);
      const meta = await extractMetadata(content);
      // InsertLogEntry requires: userId, memoryText, topicTag, metadataJson (timestamp omitted/defaulted)
      await storage.createLogEntry({
        userId: ctx.userId,
        memoryText: content,
        topicTag: meta.topicTag || 'Automation',
        mood: meta.mood || null,
        moodScore: meta.moodScore || null,
        importance: meta.importance || 5,
        detectedPeople: meta.detectedPeople || [],
        metadataJson: meta.metadataJson || {},
      });
      break;
    }

    case AUTOMATION_ACTIONS.RELAY_OUTBOUND: {
      // Queue relay as a pending AI action awaiting user approval
      if (payload.requiresApproval !== false) {
        await storage.createAiAction({
          userId: ctx.userId,
          actionType: 'RELAY_OUTBOUND',
          actionCategory: 'RELAY',
          sourceType: 'automation_rule',
          sourceId: `rule:${rule.id}`,
          title: `Relay: ${(payload.label as string) || 'Send message'}`,
          description: interpolate((payload.message as string) || '', ctx),
          payload: {
            destination: payload.destination,
            message: interpolate((payload.message as string) || '', ctx),
          },
          aiReasoning: `Automation rule "${rule.name}" triggered outbound relay.`,
          confidence: 0.9,
          status: 'pending',
          rollbackAvailable: false,
          rollbackData: null,
          resultData: null,
          errorMessage: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
      break;
    }

    default:
      console.warn(`[automation-engine] Unknown action type: ${rule.actionType}`);
  }
}

// ─── Template Interpolation ───────────────────────────────────────────────────

/**
 * Replace {{variable}} placeholders in action payload strings with context values.
 */
function interpolate(template: string, ctx: TriggerContext): string {
  return template
    .replace(/\{\{memoryContent\}\}/g, ctx.memoryContent?.slice(0, 200) || '')
    .replace(/\{\{mood\}\}/g, ctx.moodScore?.toString() || '')
    .replace(/\{\{personName\}\}/g, ctx.personName || ctx.peopleNames?.[0] || '')
    .replace(/\{\{goalTitle\}\}/g, ctx.goalTitle || '')
    .replace(/\{\{progress\}\}/g, ctx.progressPercent?.toString() || '')
    .replace(/\{\{reminderContent\}\}/g, ctx.reminderContent || '')
    .replace(/\{\{actionTitle\}\}/g, ctx.actionTitle || '')
    .replace(/\{\{keyword\}\}/g, ctx.keyword || '');
}

// ─── Main Engine Entry Point ──────────────────────────────────────────────────

/**
 * Fire a trigger event. Fetches matching enabled rules, evaluates conditions,
 * then executes actions asynchronously (fire-and-forget with error isolation).
 *
 * @param userId  - The user whose rules to evaluate
 * @param trigger - A value from AUTOMATION_TRIGGERS
 * @param ctx     - Event context used for condition evaluation and action templating
 */
export async function fireTrigger(
  userId: string,
  trigger: string,
  ctx: TriggerContext
): Promise<void> {
  try {
    const rules = await storage.getEnabledRulesByTrigger(userId, trigger);
    if (rules.length === 0) return;

    for (const rule of rules) {
      // Enforce per-day run limit
      const runsToday = await storage.countRuleRunsToday(rule.id, userId);
      const maxPerDay = rule.maxRunsPerDay ?? 3;
      if (runsToday >= maxPerDay) {
        console.log(`[automation-engine] Rule "${rule.name}" hit daily limit (${maxPerDay}), skipping`);
        continue;
      }

      // Evaluate conditions
      if (!evaluateConditions(rule.triggerConditions, { ...ctx, userId })) {
        continue;
      }

      // Execute action (isolated, non-blocking)
      setImmediate(async () => {
        try {
          await executeRuleAction(rule, { ...ctx, userId });
          await storage.recordRuleExecution(rule.id, userId, true);
          console.log(`[automation-engine] Rule "${rule.name}" executed successfully`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await storage.recordRuleExecution(rule.id, userId, false, msg).catch(() => {});
          console.error(`[automation-engine] Rule "${rule.name}" failed:`, msg);
        }
      });
    }
  } catch (err) {
    console.error(`[automation-engine] fireTrigger error (${trigger}):`, err instanceof Error ? err.message : err);
  }
}

export { AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS };
