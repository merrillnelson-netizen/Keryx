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
  // memory.logged
  memoryContent?: string;
  moodScore?: number;        // 1-10
  topics?: string[];
  peopleNames?: string[];    // people mentioned
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

  // Keyword match (case-insensitive substring)
  if (conditions.keyword && ctx.memoryContent) {
    const kw = String(conditions.keyword).toLowerCase();
    if (!ctx.memoryContent.toLowerCase().includes(kw)) return false;
  }
  if (conditions.keyword && ctx.keyword) {
    const kw = String(conditions.keyword).toLowerCase();
    if (!ctx.keyword.toLowerCase().includes(kw)) return false;
  }

  // Person name match
  if (conditions.personName) {
    const target = String(conditions.personName).toLowerCase();
    const mentioned = (ctx.peopleNames || []).map(n => n.toLowerCase());
    if (!mentioned.some(n => n.includes(target) || target.includes(n))) return false;
  }

  // Topic match
  if (conditions.topic) {
    const target = String(conditions.topic).toLowerCase();
    const topics = (ctx.topics || []).map(t => t.toLowerCase());
    if (!topics.some(t => t.includes(target) || target.includes(t))) return false;
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
  const payload = rule.actionPayload as any;

  switch (rule.actionType) {
    case AUTOMATION_ACTIONS.SEND_NOTIFICATION: {
      const { isPushConfigured, sendPushToAllUserDevices } = await import('./push-service');
      if (isPushConfigured()) {
        await sendPushToAllUserDevices(ctx.userId, {
          type: 'alert',
          title: payload.title || rule.name,
          body: interpolate(payload.body || '', ctx),
          url: payload.url || '/',
        });
      }
      break;
    }

    case AUTOMATION_ACTIONS.CREATE_REMINDER: {
      const dueAt = payload.minutesFromNow
        ? new Date(Date.now() + payload.minutesFromNow * 60_000)
        : payload.dueAt
          ? new Date(payload.dueAt)
          : new Date(Date.now() + 60 * 60_000); // default 1 hour

      await storage.createReminder(ctx.userId, {
        content: interpolate(payload.content || rule.name, ctx),
        triggerTime: dueAt,
        triggerType: 'time',
        priority: payload.priority || 'medium',
      } as any);
      break;
    }

    case AUTOMATION_ACTIONS.CREATE_AI_ACTION: {
      await storage.createAiAction({
        userId: ctx.userId,
        type: payload.actionType || 'INSIGHT_SURFACE',
        category: payload.category || 'SYSTEM',
        title: interpolate(payload.title || rule.name, ctx),
        description: interpolate(payload.description || '', ctx),
        reasoning: `Automation rule "${rule.name}" triggered this action.`,
        confidence: payload.confidence ?? 0.8,
        priority: payload.priority || 'medium',
        status: 'pending',
        sourceId: `rule:${rule.id}`,
        sourceType: 'automation_rule',
        actionData: payload.actionData || null,
      } as any);
      break;
    }

    case AUTOMATION_ACTIONS.LOG_MEMORY: {
      const { extractMetadata } = await import('./ai-service');
      const content = interpolate(payload.content || 'Automated log entry', ctx);
      const meta = await extractMetadata(content);
      await storage.createLogEntry({
        userId: ctx.userId,
        memoryText: content,
        topicTag: meta.topicTag || 'Automation',
        mood: meta.mood || null,
        moodScore: meta.moodScore || null,
        importance: meta.importance || 5,
        detectedPeople: meta.detectedPeople || [],
        metadataJson: meta.metadataJson || {},
      } as any);
      break;
    }

    case AUTOMATION_ACTIONS.RELAY_OUTBOUND: {
      // Fire a relay outbound action (queued as an AI action for approval or direct)
      if (payload.requiresApproval !== false) {
        await storage.createAiAction({
          userId: ctx.userId,
          type: 'RELAY_OUTBOUND',
          category: 'RELAY',
          title: `Relay: ${payload.label || 'Send message'}`,
          description: interpolate(payload.message || '', ctx),
          reasoning: `Automation rule "${rule.name}" triggered outbound relay.`,
          confidence: 0.9,
          priority: 'medium',
          status: 'pending',
          sourceId: `rule:${rule.id}`,
          sourceType: 'automation_rule',
          actionData: { destination: payload.destination, message: interpolate(payload.message || '', ctx) },
        } as any);
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
