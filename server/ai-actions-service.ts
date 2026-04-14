/**
 * AI Actions Service
 * Handles detection, approval, and execution of AI-proposed actions
 * 
 * Currently Supported:
 * - Calendar: create events
 * - Email: send emails
 * - Reminders: create reminders
 * 
 * Future (not yet implemented):
 * - Calendar: update, delete events
 * - Email: reply to emails
 */

import OpenAI from "openai";
import { storage } from "./storage";
import type { Discovery } from "./contextual-discoveries-service";
import { isPushConfigured, sendPushToAllUserDevices } from "./push-service";
import { 
  AI_ACTION_TYPES, 
  AI_ACTION_CATEGORIES, 
  AI_ACTION_STATUSES,
  AI_ACTION_POLICIES,
  type AiAction,
  type InsertAiAction,
  type AiActionPreference,
  type CalendarCreatePayload,
  type CalendarDeletePayload,
  type EmailSendPayload,
  type PeopleNotePayload,
  type WebSearchPayload,
  type MemoryCreatePayload,
  type FinancialAlertPayload,
  type GoalUpdatePayload,
  calendarCreatePayloadSchema,
  calendarDeletePayloadSchema,
  emailSendPayloadSchema,
  peopleNotePayloadSchema,
  webSearchPayloadSchema,
  memoryCreatePayloadSchema,
  financialAlertPayloadSchema,
  goalUpdatePayloadSchema,
} from "@shared/schema";
import { tavily } from "@tavily/core";
import { extractMetadata, generateEmbedding } from "./ai-service";
import { createCalendarEvent, isGoogleCalendarConnected, deleteGoogleCalendarEvent } from "./calendar-service";
import { sendEmail as sendGmailEmail, isGmailConnected, getGmailCapabilities } from "./gmail-service";
import { isOutlookConnected } from "./outlook-calendar-service";
import { sendOutlookEmail, isOutlookMailConnected } from "./outlook-mail-service";

const openai = new OpenAI({ 
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  // Only set baseURL when using Replit AI Integration
  ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
  timeout: 30000,
  maxRetries: 2,
});

/**
 * Action types that can spawn follow-up child actions via chaining.
 * Deliberately narrow — we only chain actions that naturally lead to related next steps.
 * memory.create and financial.alert are excluded to avoid noisy or recursive chains.
 */
const CHAINABLE_ACTION_TYPES = new Set([
  'calendar.create',
  'email.send',
  'people.note',
]);

const MAX_CHAIN_DEPTH = 3;

/**
 * Detected action from user input
 */
export interface DetectedAction {
  detected: boolean;
  actionType: string;
  actionCategory: string;
  title: string;
  description: string;
  payload: any;
  reasoning: string;
  confidence: number;
}

/**
 * Action execution result
 */
export interface ActionExecutionResult {
  success: boolean;
  resultData?: any;
  errorMessage?: string;
  rollbackData?: any;
}

/**
 * Supported action types with their descriptions
 */
export const ACTION_DEFINITIONS = {
  // — Calendar —
  [AI_ACTION_TYPES.CALENDAR_CREATE]: {
    category: AI_ACTION_CATEGORIES.CALENDAR,
    description: 'Create a new calendar event',
    examples: ['schedule a meeting', 'add an appointment', 'book time for', 'set up a call'],
    supported: true,
  },
  [AI_ACTION_TYPES.CALENDAR_DELETE]: {
    category: AI_ACTION_CATEGORIES.CALENDAR,
    description: 'Delete an existing calendar event',
    examples: ['cancel my meeting', 'remove the appointment', 'delete the event'],
    supported: true,
  },
  // — Email —
  [AI_ACTION_TYPES.EMAIL_SEND]: {
    category: AI_ACTION_CATEGORIES.EMAIL,
    description: 'Send a new email',
    examples: ['send an email to', 'email them about', 'write to', 'message them'],
    supported: true,
  },
  [AI_ACTION_TYPES.EMAIL_DRAFT]: {
    category: AI_ACTION_CATEGORIES.EMAIL,
    description: 'Draft an email for review before sending',
    examples: ['draft a reply', 'prepare an email', 'write a draft'],
    supported: true,
  },
  // — Reminders —
  [AI_ACTION_TYPES.REMINDER_CREATE]: {
    category: AI_ACTION_CATEGORIES.REMINDER,
    description: 'Create a reminder',
    examples: ['remind me to', 'set a reminder for', "don't let me forget"],
    supported: true,
  },
  // — People / Relationship —
  [AI_ACTION_TYPES.PEOPLE_REACH_OUT]: {
    category: AI_ACTION_CATEGORIES.PEOPLE,
    description: 'Suggest contacting someone you haven\'t connected with recently',
    examples: ['check in with', 'reach out to', 'follow up with'],
    supported: true,
  },
  [AI_ACTION_TYPES.PERSON_DECAY_AUDIT]: {
    category: AI_ACTION_CATEGORIES.PEOPLE,
    description: 'Review relationship priority after low activity',
    examples: ['velocity drop audit'],
    supported: true,
  },
  // — Goals —
  [AI_ACTION_TYPES.GOAL_UPDATE]: {
    category: AI_ACTION_CATEGORIES.GOALS,
    description: 'Update goal progress based on memory evidence',
    examples: ['log goal progress', 'update milestone', 'mark progress on goal'],
    supported: true,
  },
  [AI_ACTION_TYPES.GOAL_MILESTONE]: {
    category: AI_ACTION_CATEGORIES.GOALS,
    description: 'Suggest adding or completing a goal milestone',
    examples: ['add milestone', 'complete milestone'],
    supported: true,
  },
  // — People note —
  [AI_ACTION_TYPES.PEOPLE_NOTE]: {
    category: AI_ACTION_CATEGORIES.PEOPLE,
    description: 'Add a note to a person\'s contact record',
    examples: ['add note about', 'note that John said', 'remember about Sarah'],
    supported: true,
  },
  // — Web Search —
  [AI_ACTION_TYPES.WEB_SEARCH]: {
    category: AI_ACTION_CATEGORIES.RESEARCH,
    description: 'Search the web and surface results',
    examples: ['search for', 'look up', 'find information about', 'research'],
    supported: true,
  },
  // — Memory Create —
  [AI_ACTION_TYPES.MEMORY_CREATE]: {
    category: AI_ACTION_CATEGORIES.MEMORY,
    description: 'Create a new memory log entry',
    examples: ['log that', 'remember that', 'note that', 'record this'],
    supported: true,
  },
  // — Financial Alert —
  [AI_ACTION_TYPES.FINANCIAL_ALERT]: {
    category: AI_ACTION_CATEGORIES.FINANCIAL,
    description: 'Surface a financial pattern or spending alert',
    examples: ['spending alert', 'budget warning', 'unusual charge'],
    supported: true,
  },
  // — System / Proactive —
  [AI_ACTION_TYPES.INSIGHT_SURFACE]: {
    category: AI_ACTION_CATEGORIES.SYSTEM,
    description: 'Surface a curated insight for your attention',
    examples: ['proactive insight', 'pattern alert', 'briefing highlight'],
    supported: true,
  },
  // — Relay / Outbound —
  [AI_ACTION_TYPES.RELAY_OUTBOUND]: {
    category: AI_ACTION_CATEGORIES.RELAY,
    description: 'Send content via outbound relay to an external surface',
    examples: ['send to Telegram', 'relay to phone', 'push to glasses'],
    supported: true,
  },
};

/**
 * Detect if user input contains an actionable request
 * Uses AI to understand intent and extract action parameters
 */
export async function detectActionFromInput(
  userInput: string,
  contextInfo?: { 
    currentTime?: Date;
    recentMemories?: string[];
    connectedProviders?: { calendar?: string; email?: string };
    timezone?: string;
    userProfile?: string | null;
  }
): Promise<DetectedAction | null> {
  try {
    const currentTime = contextInfo?.currentTime || new Date();
    const providers = contextInfo?.connectedProviders || {};
    const userTimezone = contextInfo?.timezone || 'UTC';
    const userProfileNote = contextInfo?.userProfile ? `\n- User profile: ${contextInfo.userProfile}` : '';
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that detects actionable requests from user input. Analyze the text to determine if the user is asking you to perform an action on their behalf.

AVAILABLE ACTIONS:
1. calendar.create - Create a calendar event (schedule meeting, book appointment, set up call)
2. calendar.delete - Delete an existing calendar event by its event ID (cancel meeting, remove appointment)
3. email.send - Send a new email to someone
4. reminder.create - Set a reminder for the user
5. people.note - Add a note to a person's contact record (e.g. "note that Sarah said she's moving to Denver")
6. web.search - Search the web for information (e.g. "search for best restaurants in Denver", "look up the latest on X")
7. memory.create - Explicitly log a new memory entry (e.g. "log that I finished the report", "record that I met with the team")
8. goal.update - Update progress on a known goal (e.g. "mark my fitness goal at 60%", "update my savings goal to 40% complete")
9. financial.alert - Surface a financial pattern or spending concern (e.g. "alert me about high spending on dining", "flag recurring charges")

NOT SUPPORTED (do not detect these):
- calendar.update - Updating existing events is not yet supported
- email.reply - Replying to emails is not yet supported

CURRENT CONTEXT:
- Current time: ${currentTime.toISOString()}
- User's timezone: ${userTimezone}
- Calendar provider: ${providers.calendar || 'not connected'}
- Email provider: ${providers.email || 'not connected'}${userProfileNote}

DETECTION RULES:
- Look for imperative phrases like "schedule", "send", "remind me", "set up", "book", "email", "search for", "look up", "find", "note that", "log that", "record that", "remember about", "update goal", "mark progress"
- Look for future-oriented requests that require external action
- For people.note: detect when user wants to annotate a contact with context (conversations, preferences, facts about them)
- For web.search: detect explicit search requests or "look up X" / "find info on X" phrasing
- For memory.create: detect explicit logging requests ("log that", "record that", "note that I did X")
- For goal.update: detect when user wants to update a specific goal's progress percentage
- For financial.alert: detect when user wants to be alerted about a spending pattern or financial concern
- Do NOT flag simple reflective statements or observations as memory.create — only explicit logging requests
- Do NOT flag general information queries as actions (only explicit "search for" / "find" phrasing)

If an action is detected, extract:
1. The specific action type
2. All relevant parameters (who, what, when, where)
3. Parse relative times into absolute datetime (e.g., "tomorrow at 3pm", "next Monday")
4. Extract email addresses if mentioned, or note the person's name for lookup

Respond with JSON:
{
  "detected": boolean,
  "actionType": "calendar.create" | "calendar.delete" | "email.send" | "reminder.create" | "people.note" | "web.search" | "memory.create" | "goal.update" | "financial.alert" | null,
  "actionCategory": "calendar" | "email" | "reminder" | "people" | "research" | "memory" | "goals" | "financial" | null,
  "title": "Brief description of the action",
  "description": "Detailed explanation of what will be done",
  "payload": {
    // For calendar.create:
    "summary": "Event title",
    "description": "Event description",
    "startDateTime": "ISO 8601 datetime WITHOUT timezone suffix (e.g., 2025-01-03T11:00:00)",
    "endDateTime": "ISO 8601 datetime WITHOUT timezone suffix",
    "attendees": ["email@example.com"],
    "location": "optional location",
    "timezone": "${userTimezone}"

    // For calendar.delete:
    "eventId": "Google Calendar event ID (required)",
    "eventTitle": "Human-readable event title for confirmation display"
    
    // For email.send:
    "to": ["email or name"],
    "subject": "Email subject",
    "body": "Email body content"
    
    // For reminder.create:
    "title": "Reminder title",
    "dueDateTime": "ISO 8601 datetime",
    "notes": "optional notes"

    // For people.note:
    "personName": "Name of the person",
    "note": "The note content to add to their record"

    // For web.search:
    "query": "The exact search query",
    "context": "Why the user wants this searched",
    "maxResults": 3

    // For memory.create:
    "memoryText": "The full memory text to log",
    "topicTag": "optional topic category",
    "mood": "optional mood (happy/sad/neutral/excited/stressed/grateful/anxious/content)"

    // For goal.update:
    "goalId": "goal ID if known, otherwise omit",
    "goalTitle": "Title of the goal to update",
    "newProgress": 0-100 (integer percentage),
    "currentProgress": 0-100 (integer, if known),
    "progressNote": "optional note about the update"

    // For financial.alert:
    "alertType": "spending_spike" | "recurring_charge" | "budget_threshold" | "unusual_pattern" | "insight",
    "title": "Short alert headline",
    "details": "Explanation of the financial concern",
    "amount": optional number,
    "merchant": "optional merchant name",
    "category": "optional spending category"
  },
  "reasoning": "Explanation of why this was detected as an action and how parameters were extracted",
  "confidence": 0.0-1.0
}

IMPORTANT: For calendar events, the datetime should represent the time in the user's timezone (${userTimezone}). Do NOT append 'Z' or timezone offset to the datetime string - just use format like "2025-01-03T11:00:00".

If no action is detected, respond with: { "detected": false }`,
        },
        {
          role: "user",
          content: userInput,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const result = JSON.parse(content);
    
    if (!result.detected) return null;
    
    return {
      detected: true,
      actionType: result.actionType,
      actionCategory: result.actionCategory,
      title: result.title || 'Untitled Action',
      description: result.description || '',
      payload: result.payload || {},
      reasoning: result.reasoning || '',
      confidence: result.confidence || 0.5,
    };
  } catch (error) {
    console.error('Failed to detect action from input:', error);
    return null;
  }
}

/**
 * Check user's preference policy for an action type
 * Returns the policy or default 'confirm' if not set
 */
export async function getActionPolicy(
  userId: string, 
  actionType: string
): Promise<{ policy: string; conditions?: Record<string, unknown> }> {
  try {
    const pref = await storage.getAiActionPreference(userId, actionType);
    if (pref) {
      return { 
        policy: pref.policy, 
        conditions: pref.autoApproveConditions as Record<string, unknown> | undefined
      };
    }
    // Default policy: require confirmation for all actions
    return { policy: AI_ACTION_POLICIES.CONFIRM };
  } catch (error) {
    console.error('Failed to get action policy:', error);
    return { policy: AI_ACTION_POLICIES.CONFIRM };
  }
}

/**
 * Create a pending action for user approval
 */
export async function createPendingAction(
  userId: string,
  detected: DetectedAction,
  sourceType: 'voice_input' | 'memory' | 'briefing' | 'manual' | 'discovery' | 'velocity' | 'high_signal',
  sourceId?: string,
  sourceText?: string
): Promise<AiAction> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // Expire after 24 hours
  
  const action: InsertAiAction = {
    userId,
    actionType: detected.actionType,
    actionCategory: detected.actionCategory,
    sourceType,
    sourceId,
    sourceText,
    title: detected.title,
    description: detected.description,
    payload: detected.payload,
    status: AI_ACTION_STATUSES.PENDING,
    aiReasoning: detected.reasoning,
    confidence: detected.confidence,
    expiresAt,
  };
  
  const createdAction = await storage.createAiAction(action);
  
  // Send push notification for pending action (background, non-blocking)
  if (isPushConfigured()) {
    setImmediate(async () => {
      try {
        const actionEmoji = detected.actionCategory === 'calendar' ? '📅' :
                           detected.actionCategory === 'email' ? '📧' :
                           detected.actionCategory === 'reminder' ? '⏰' : '🤖';
        await sendPushToAllUserDevices(userId, {
          type: 'action_required',
          title: `${actionEmoji} Action needs approval`,
          body: detected.title.substring(0, 100),
          url: '/agent',
          requireInteraction: true,
        });
      } catch (err) {
        console.error('Push notification for pending action failed:', err);
      }
    });
  }
  
  return createdAction;
}

/**
 * GPT-powered follow-up detection for action chaining.
 * Given a completed action's type, payload, and result, asks the AI whether
 * there is a natural next step with confidence ≥ 0.75.
 *
 * Returns a DetectedAction if a follow-up is warranted, null otherwise.
 * Intentionally concise to minimize latency and token cost.
 */
async function detectFollowUpAction(
  completedAction: AiAction,
  resultData: unknown,
  userProfile?: string | null,
): Promise<DetectedAction | null> {
  try {
    const payload = completedAction.payload as Record<string, unknown>;
    const sourceContext = completedAction.sourceText
      ? `\n- Original context: "${completedAction.sourceText.slice(0, 300)}"`
      : '';
    const userProfileContext = userProfile ? `\n\nUSER PROFILE (use this to decide channel/approach):\n${userProfile}` : '';
    const prompt = `A user's AI assistant just successfully completed an action. Determine if there is ONE natural, HIGH-VALUE follow-up action warranted.

COMPLETED ACTION:
- Type: ${completedAction.actionType}
- Title: ${completedAction.title}
- Payload summary: ${JSON.stringify(payload).slice(0, 400)}
- Result: ${JSON.stringify(resultData).slice(0, 200)}${sourceContext}${userProfileContext}

ONLY suggest a follow-up if:
1. It is a natural, closely related next step (e.g., after scheduling a meeting with someone → draft a confirmation email to them)
2. Confidence ≥ 0.75
3. The follow-up type is one of: calendar.create, email.send, people.note

Do NOT suggest follow-ups for exploratory or advisory actions, or if there is no clear compelling next step.

Payload shapes (MUST match exactly):
- email.send: { "to": ["user@example.com"], "subject": "...", "body": "...", "recipientId": "<personId if known>" }
  IMPORTANT: "to" must be an array of real email addresses. If you only know a recipientId (person UUID), include it alongside an empty "to" array: { "to": [], "recipientId": "..." }
- calendar.create: { "title": "...", "startDateTime": "ISO8601", "endDateTime": "ISO8601", "description": "..." }
- people.note: { "personName": "...", "note": "...", "personId": "<if known>" }

Respond with JSON:
{
  "followUp": boolean,
  "actionType": "calendar.create" | "email.send" | "people.note" | null,
  "actionCategory": "calendar" | "email" | "people" | null,
  "title": "Brief title",
  "description": "What this follow-up does and why",
  "payload": { /* use exact shape above */ },
  "reasoning": "Why this is a natural next step",
  "confidence": 0.0-1.0
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a concise AI assistant that suggests follow-up actions. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (!parsed.followUp || !parsed.actionType || (parsed.confidence ?? 0) < 0.75) return null;

    return {
      detected: true,
      actionType: parsed.actionType,
      actionCategory: parsed.actionCategory || 'system',
      title: parsed.title || 'Follow-up action',
      description: parsed.description || '',
      payload: parsed.payload || {},
      reasoning: parsed.reasoning || 'Natural follow-up from completed action',
      confidence: parsed.confidence,
    };
  } catch (err) {
    console.warn('[ai-actions] Follow-up detection failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Execute an approved action
 * Routes to the appropriate provider service based on action type
 */
export async function executeAction(action: AiAction): Promise<ActionExecutionResult> {
  try {
    // Update status to executing
    await storage.updateAiAction(action.id, action.userId, { 
      status: AI_ACTION_STATUSES.EXECUTING 
    });
    
    let result: ActionExecutionResult;
    
    switch (action.actionType) {
      case AI_ACTION_TYPES.CALENDAR_CREATE:
        result = await executeCalendarCreate(action);
        break;
      case AI_ACTION_TYPES.CALENDAR_DELETE:
        result = await executeCalendarDelete(action);
        break;
      case AI_ACTION_TYPES.EMAIL_SEND:
        result = await executeEmailSend(action);
        break;
      case AI_ACTION_TYPES.REMINDER_CREATE:
        result = await executeReminderCreate(action);
        break;
      case AI_ACTION_TYPES.PEOPLE_REACH_OUT:
        // Reach-out actions are advisory — approving acknowledges the suggestion.
        result = { success: true, resultData: { acknowledged: true, type: 'reach_out' } };
        break;
      case AI_ACTION_TYPES.GOAL_UPDATE:
        result = await executeGoalUpdate(action);
        break;
      case AI_ACTION_TYPES.GOAL_MILESTONE:
        // Milestone suggestion is advisory — user confirms in the Goals page.
        result = { success: true, resultData: { acknowledged: true, type: action.actionType } };
        break;
      case AI_ACTION_TYPES.PEOPLE_NOTE:
        result = await executePeopleNote(action);
        break;
      case AI_ACTION_TYPES.WEB_SEARCH:
        result = await executeWebSearch(action);
        break;
      case AI_ACTION_TYPES.MEMORY_CREATE:
        result = await executeMemoryCreate(action);
        break;
      case AI_ACTION_TYPES.FINANCIAL_ALERT:
        result = await executeFinancialAlert(action);
        break;
      case AI_ACTION_TYPES.INSIGHT_SURFACE:
        // Insight surface actions are informational — approving dismisses the card.
        result = { success: true, resultData: { acknowledged: true, type: 'insight_surface' } };
        break;
      case AI_ACTION_TYPES.RELAY_OUTBOUND:
        result = await executeRelayOutbound(action);
        break;
      case AI_ACTION_TYPES.CHAIN_SEQUENCE:
        result = await executeChainSequence(action);
        break;
      case AI_ACTION_TYPES.PERSON_DECAY_AUDIT:
      case 'person_decay_audit':
        // Decay audit actions are advisory — approving is an acknowledgment.
        result = { success: true, resultData: { acknowledged: true } };
        break;
      case AI_ACTION_TYPES.EMAIL_DRAFT: {
        // Draft actions produce a draft payload for the user to review — mark complete.
        const draftPayload = action.payload as Record<string, unknown>;
        result = { success: true, resultData: { drafted: true, subject: typeof draftPayload?.subject === 'string' ? draftPayload.subject : null } };
        break;
      }
      default:
        // Provide helpful error messages for not-yet-implemented actions
        const notImplementedActions: Record<string, string> = {
          'calendar.update': 'Updating existing calendar events is not yet supported. Please modify the event directly in your calendar app.',
          'email.reply': 'Replying to emails is not yet supported. Please compose a new email instead.',
        };
        const helpfulMessage = notImplementedActions[action.actionType];
        result = { 
          success: false, 
          errorMessage: helpfulMessage || `This action type is not currently supported: ${action.actionType}` 
        };
    }
    
    // Update action with result - use raw SQL update for executedAt since it's not in InsertAiAction
    const finalStatus = result.success ? AI_ACTION_STATUSES.COMPLETED : AI_ACTION_STATUSES.FAILED;
    await storage.updateAiAction(action.id, action.userId, {
      status: finalStatus,
      resultData: result.resultData,
      errorMessage: result.errorMessage,
      rollbackAvailable: !!result.rollbackData,
      rollbackData: result.rollbackData,
    });

    // ─── Action Chaining: detect and spawn follow-up child action ───────────────
    if (result.success && CHAINABLE_ACTION_TYPES.has(action.actionType)) {
      const currentDepth = (action.chainDepth ?? 0);
      if (currentDepth < MAX_CHAIN_DEPTH) {
        setImmediate(async () => {
          try {
            // Check user's allow_action_chaining setting
            const userSettings = await storage.getSettings(action.userId);
            if (userSettings?.allowActionChaining === false) return;

            const followUp = await detectFollowUpAction(action, result.resultData, userSettings?.userProfile);
            if (!followUp) return;

            // Hard server-side whitelist: reject any child type not in CHAINABLE_ACTION_TYPES
            if (!CHAINABLE_ACTION_TYPES.has(followUp.actionType)) {
              console.warn(`[ai-actions] Chain rejected — child type "${followUp.actionType}" not in CHAINABLE_ACTION_TYPES`);
              return;
            }

            // Determine policy for the child action type
            const { policy } = await getActionPolicy(action.userId, followUp.actionType);
            if (policy === AI_ACTION_POLICIES.DISABLED) return;

            const childDepth = currentDepth + 1;
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            const childAction: InsertAiAction = {
              userId: action.userId,
              actionType: followUp.actionType,
              actionCategory: followUp.actionCategory,
              sourceType: 'manual', // chaining is agent-initiated
              sourceText: `Chained from: ${action.title}`,
              title: followUp.title,
              description: followUp.description,
              payload: followUp.payload,
              status: AI_ACTION_STATUSES.PENDING,
              aiReasoning: followUp.reasoning,
              confidence: followUp.confidence,
              parentActionId: action.id,
              chainDepth: childDepth,
              expiresAt,
            };

            const created = await storage.createAiAction(childAction);
            console.log(`[ai-actions] Chained action spawned: ${followUp.actionType} (depth ${childDepth}) id=${created.id}`);

            // If the user has auto-policy for this action type, execute it immediately
            if (policy === AI_ACTION_POLICIES.AUTO) {
              await executeAction(created);
            }
          } catch (chainErr) {
            console.warn('[ai-actions] Action chaining failed:', chainErr instanceof Error ? chainErr.message : chainErr);
          }
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────────────

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await storage.updateAiAction(action.id, action.userId, {
      status: AI_ACTION_STATUSES.FAILED,
      errorMessage,
    });
    
    return { success: false, errorMessage };
  }
}

/**
 * Execute calendar create action
 */
async function executeCalendarCreate(action: AiAction): Promise<ActionExecutionResult> {
  const payload = action.payload as CalendarCreatePayload;
  
  // Validate payload
  const validation = calendarCreatePayloadSchema.safeParse(payload);
  if (!validation.success) {
    return { 
      success: false, 
      errorMessage: `Invalid calendar payload: ${validation.error.message}` 
    };
  }
  
  const provider = payload.provider || 'google';
  
  try {
    // Use the unified createCalendarEvent which handles provider selection
    const createdEvent = await createCalendarEvent(
      payload.summary,
      payload.startDateTime,
      payload.endDateTime,
      {
        attendees: payload.attendees,
        location: payload.location,
        description: payload.description,
        timezone: payload.timezone,
        userId: action.userId,
      }
    );
    
    if (!createdEvent) {
      return { success: false, errorMessage: 'Failed to create calendar event' };
    }
    
    return {
      success: true,
      resultData: { eventId: createdEvent.id, title: createdEvent.title },
      rollbackData: { eventId: createdEvent.id, action: 'delete', provider },
    };
  } catch (error) {
    return { 
      success: false, 
      errorMessage: error instanceof Error ? error.message : 'Calendar creation failed' 
    };
  }
}

/**
 * Execute calendar delete action — removes an event from the user's primary calendar
 */
async function executeCalendarDelete(action: AiAction): Promise<ActionExecutionResult> {
  const payload = action.payload as CalendarDeletePayload;

  const validation = calendarDeletePayloadSchema.safeParse(payload);
  if (!validation.success) {
    return {
      success: false,
      errorMessage: `Invalid calendar delete payload: ${validation.error.message}`,
    };
  }

  const provider = payload.provider || 'google';

  try {
    const isConnected = await isGoogleCalendarConnected(action.userId);
    if (!isConnected) {
      return { success: false, errorMessage: 'Google Calendar not connected. Please connect in Settings.' };
    }

    await deleteGoogleCalendarEvent(payload.eventId, action.userId);

    return {
      success: true,
      resultData: {
        deletedEventId: payload.eventId,
        title: payload.eventTitle || 'Calendar event',
      },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Failed to delete calendar event',
    };
  }
}

/**
 * Execute email send action
 */
async function executeEmailSend(action: AiAction): Promise<ActionExecutionResult> {
  const raw = action.payload as Record<string, unknown>;

  // Resolve recipientId → actual email address if `to` is missing
  if ((!raw.to || (Array.isArray(raw.to) && raw.to.length === 0)) && raw.recipientId) {
    const person = await storage.getPersonById(action.userId, raw.recipientId as string);
    if (!person) {
      return { success: false, errorMessage: `Could not find person with id "${raw.recipientId}" to send email to.` };
    }
    if (!person.email) {
      return {
        success: false,
        errorMessage: `No email address on file for ${person.name}. Add their email on the People page first.`,
      };
    }
    raw.to = [person.email];
  }

  const payload = raw as unknown as EmailSendPayload;

  // Validate payload
  const validation = emailSendPayloadSchema.safeParse(payload);
  if (!validation.success) {
    return { 
      success: false, 
      errorMessage: `Invalid email payload: ${validation.error.message}` 
    };
  }
  
  const provider = payload.provider || 'gmail';
  
  try {
    if (provider === 'gmail') {
      const isConnected = await isGmailConnected(action.userId);
      if (!isConnected) {
        return { success: false, errorMessage: 'Gmail not connected' };
      }
      
      const result = await sendGmailEmail(action.userId, {
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        cc: payload.cc,
        bcc: payload.bcc,
      });
      
      if (!result.success) {
        return { success: false, errorMessage: result.error || 'Failed to send email' };
      }
      
      return {
        success: true,
        resultData: { messageId: result.messageId, provider: 'gmail' },
      };
    } else if (provider === 'outlook') {
      const isConnected = await isOutlookMailConnected(action.userId);
      if (!isConnected) {
        return { success: false, errorMessage: 'Outlook Mail not connected' };
      }
      
      const result = await sendOutlookEmail(action.userId, {
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        cc: payload.cc,
        bcc: payload.bcc,
      });
      
      if (!result.success) {
        return { success: false, errorMessage: result.error || 'Failed to send email' };
      }
      
      return {
        success: true,
        resultData: { messageId: result.messageId, provider: 'outlook' },
      };
    }
    
    return { success: false, errorMessage: `Unknown email provider: ${provider}` };
  } catch (error) {
    return { 
      success: false, 
      errorMessage: error instanceof Error ? error.message : 'Email send failed' 
    };
  }
}

/**
 * Execute reminder create action
 * For now, reminders are stored as calendar events with a reminder flag
 */
async function executeReminderCreate(action: AiAction): Promise<ActionExecutionResult> {
  const rawPayload = action.payload as Record<string, unknown>;
  const title = typeof rawPayload.title === 'string' ? rawPayload.title : 'Reminder';
  const notes = typeof rawPayload.notes === 'string' ? rawPayload.notes : '';
  const dueDateTime = typeof rawPayload.dueDateTime === 'string' ? rawPayload.dueDateTime : '';

  // Convert reminder to calendar event
  const reminderPayload: CalendarCreatePayload = {
    summary: `[Reminder] ${title}`,
    description: notes,
    startDateTime: dueDateTime,
    endDateTime: dueDateTime, // Same time - it's a reminder
  };

  const modifiedAction: AiAction = { ...action, payload: reminderPayload };
  return await executeCalendarCreate(modifiedAction);
}

/**
 * Execute chain.sequence action — spawns a series of child AI actions in order.
 *
 * The `payload` must contain:
 *   - `steps` (array): list of action definitions, each with { actionType, title, description, payload }
 *   - `autoApprove` (bool, optional): if true, all steps are created as 'pending' (default)
 *
 * Steps are created as individual AI action records. The parent chain action is marked complete
 * immediately after spawning all children.
 */
interface ChainStep {
  actionType: string;
  title: string;
  description?: string;
  payload: Record<string, unknown>;
}

async function executeChainSequence(action: AiAction): Promise<ActionExecutionResult> {
  const chainPayload = action.payload as Record<string, unknown>;
  const steps: ChainStep[] = Array.isArray(chainPayload?.steps) ? (chainPayload.steps as ChainStep[]) : [];

  if (!steps || steps.length === 0) {
    return { success: false, errorMessage: 'Chain action has no steps defined.' };
  }

  const MAX_STEPS = 10;
  if (steps.length > MAX_STEPS) {
    return { success: false, errorMessage: `Chain action exceeds maximum step limit (${MAX_STEPS}).` };
  }

  const created: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const stepAction = await storage.createAiAction({
        userId: action.userId,
        actionType: step.actionType,
        actionCategory: getActionCategory(step.actionType),
        sourceType: 'chain',
        sourceId: action.id,
        sourceText: `Step ${i + 1} of ${steps.length} in chain "${action.title}"`,
        title: step.title || `Step ${i + 1}`,
        description: step.description || '',
        payload: step.payload || {},
        status: AI_ACTION_STATUSES.PENDING,
        aiReasoning: `Created as step ${i + 1} of action chain "${action.title}"`,
        confidence: (action.confidence as number) ?? 0.8,
        rollbackAvailable: false,
        rollbackData: null,
        resultData: null,
        errorMessage: null,
        expiresAt: action.expiresAt ? new Date(action.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      created.push(stepAction.id);
    } catch (err) {
      failed.push(`Step ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (created.length === 0) {
    return { success: false, errorMessage: `All chain steps failed: ${failed.join('; ')}` };
  }

  return {
    success: true,
    resultData: {
      stepsCreated: created.length,
      stepsFailed: failed.length,
      childActionIds: created,
      errors: failed.length > 0 ? failed : undefined,
    },
  };
}

/**
 * Execute people.note action — adds a note to a person's record
 */
async function executePeopleNote(action: AiAction): Promise<ActionExecutionResult> {
  const rawPayload = action.payload as Record<string, unknown>;
  const validation = peopleNotePayloadSchema.safeParse(rawPayload);
  if (!validation.success) {
    return { success: false, errorMessage: `Invalid people.note payload: ${validation.error.message}` };
  }
  const payload = validation.data;

  try {
    let personId = payload.personId;

    // If no personId, try to find the person by name
    if (!personId) {
      const people = await storage.getPeople(action.userId);
      const matched = people.find(p =>
        p.name.toLowerCase().includes(payload.personName.toLowerCase()) ||
        payload.personName.toLowerCase().includes(p.name.toLowerCase())
      );
      if (matched) {
        personId = matched.id;
      }
    }

    if (!personId) {
      return {
        success: false,
        errorMessage: `Could not find a contact named "${payload.personName}". Please add them to your contacts first.`,
      };
    }

    // Fetch current person to append note
    const person = await storage.getPersonById(action.userId, personId);
    if (!person) {
      return { success: false, errorMessage: 'Contact not found.' };
    }

    const timestamp = new Date().toISOString();
    const noteEntry = `[${timestamp}] ${payload.note}`;
    const existingNotes = (person.notes ?? '') as string;
    const updatedNotes = existingNotes ? `${existingNotes}\n${noteEntry}` : noteEntry;

    await storage.updatePerson(action.userId, personId, { notes: updatedNotes });

    return {
      success: true,
      resultData: { personId, personName: person.name, note: payload.note },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Failed to add note to contact',
    };
  }
}

/**
 * Typed shape of a single Tavily result used within this module.
 */
interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/**
 * Typed shape of the Tavily search response.
 */
interface TavilySearchResponse {
  results: TavilySearchResult[];
  answer?: string;
}

/**
 * Execute web.search action — runs a Tavily search and surfaces results as discoveries.
 */
async function executeWebSearch(action: AiAction): Promise<ActionExecutionResult> {
  const rawPayload = action.payload as Record<string, unknown>;
  const validation = webSearchPayloadSchema.safeParse(rawPayload);
  if (!validation.success) {
    return { success: false, errorMessage: `Invalid web.search payload: ${validation.error.message}` };
  }
  const payload = validation.data;

  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    return { success: false, errorMessage: 'Tavily API key not configured. Add TAVILY_API_KEY in settings.' };
  }

  try {
    const tvly = tavily({ apiKey: tavilyApiKey });
    const maxResults = payload.maxResults ?? 3;

    const response = await tvly.search(payload.query, {
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: true,
    }) as TavilySearchResponse;

    const rawResults = response.results ?? [];
    const discoveryItems = rawResults.map((r) => {
      let sourceHost = r.url;
      try { sourceHost = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      return {
        id: `ws-${action.id}-${Math.random().toString(36).slice(2, 8)}`,
        title: r.title,
        content: r.content?.slice(0, 400) ?? '',
        url: r.url,
        source: sourceHost,
        insightContext: `Searched for: ${payload.query}${payload.context ? ` (${payload.context})` : ''}`,
        category: 'general' as const,
        relevanceScore: r.score ?? 0.5,
        urgency: 'general' as const,
      };
    });

    // Merge into existing discoveries cache (don't clobber; prepend agent results)
    const existingCache = await storage.getAiCache(action.userId, 'discoveries', 'discoveries');
    const existingDiscoveries: Discovery[] = Array.isArray(
      (existingCache?.data as Record<string, unknown>)?.discoveries
    ) ? ((existingCache!.data as Record<string, unknown>).discoveries as Discovery[]) : [];

    const mergedDiscoveries = [
      ...discoveryItems,
      ...existingDiscoveries.filter(d => !discoveryItems.some(nd => nd.url === d.url)),
    ].slice(0, 20); // cap at 20 total discoveries

    await storage.setAiCache(action.userId, 'discoveries', 'discoveries', {
      discoveries: mergedDiscoveries,
      insights: (existingCache?.data as Record<string, unknown>)?.insights ?? [],
      generatedAt: new Date().toISOString(),
      source: 'agent_web_search',
      query: payload.query,
    }, `agent_${action.id}`, mergedDiscoveries.length, 60 * 24 * 7); // 7-day TTL

    return {
      success: true,
      resultData: {
        query: payload.query,
        context: payload.context ?? null,
        answer: response.answer ?? null,
        discoveries: discoveryItems,
        resultCount: discoveryItems.length,
        cachedAsDiscoveries: true,
      },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Web search failed',
    };
  }
}

/**
 * Execute memory.create action — creates a new log entry using the full ingestion pipeline.
 * This includes AI metadata extraction and embedding generation.
 */
async function executeMemoryCreate(action: AiAction): Promise<ActionExecutionResult> {
  const rawPayload = action.payload as Record<string, unknown>;
  const validation = memoryCreatePayloadSchema.safeParse(rawPayload);
  if (!validation.success) {
    return { success: false, errorMessage: `Invalid memory.create payload: ${validation.error.message}` };
  }
  const payload = validation.data;

  try {
    const [extracted, embeddingVector] = await Promise.all([
      extractMetadata(payload.memoryText),
      generateEmbedding(payload.memoryText),
    ]);

    const topicTag = payload.topicTag || extracted.topicTag || 'General';
    const mood = payload.mood || extracted.mood || null;
    const metadataJson = { ...extracted.metadataJson, source: 'agent_action', actionId: action.id };

    const entry = await storage.createLogEntry({
      userId: action.userId,
      memoryText: payload.memoryText,
      topicTag,
      mood,
      importance: extracted.importance ?? 5,
      metadataJson,
      embeddingVector,
    });

    return {
      success: true,
      resultData: { entryId: entry.id, memoryText: payload.memoryText, topicTag },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Failed to create memory',
    };
  }
}

/**
 * Execute goal.update action — mutates the goal's progress percentage in storage.
 */
async function executeGoalUpdate(action: AiAction): Promise<ActionExecutionResult> {
  const rawPayload = action.payload as Record<string, unknown>;
  const validation = goalUpdatePayloadSchema.safeParse(rawPayload);
  if (!validation.success) {
    return { success: false, errorMessage: `Invalid goal.update payload: ${validation.error.message}` };
  }
  const payload = validation.data;

  // newProgress is required to actually execute an update
  if (payload.newProgress === undefined || payload.newProgress === null) {
    return {
      success: false,
      errorMessage: `No progress value specified for "${payload.goalTitle}". This action was proposed as a check-in reminder — reject it and manually update your goal progress in the Goals page.`,
    };
  }

  try {
    let goalId = payload.goalId;

    // If no goalId provided, attempt fuzzy match by title
    if (!goalId) {
      const goals = await storage.getGoals(action.userId);

      // Normalize: strip numbers/percentages and common noise words, then compare
      const normalize = (s: string) =>
        s.toLowerCase()
          .replace(/\d+\s*%/g, '')            // "70%" → ""
          .replace(/\b(goal|progress|update|my|the|a|an|to|for|on)\b/g, '')
          .replace(/[^a-z\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const wordSet = (s: string) => new Set(normalize(s).split(' ').filter(w => w.length > 2));
      const overlapScore = (a: string, b: string) => {
        const wa = wordSet(a);
        const wb = wordSet(b);
        let n = 0;
        for (const w of wa) if (wb.has(w)) n++;
        return n;
      };

      const normPayload = normalize(payload.goalTitle);
      let matched = goals.find(g => {
        const normGoal = normalize(g.title);
        return normGoal === normPayload ||
          normGoal.includes(normPayload) ||
          normPayload.includes(normGoal) ||
          g.title.toLowerCase().includes(payload.goalTitle.toLowerCase()) ||
          payload.goalTitle.toLowerCase().includes(g.title.toLowerCase());
      });

      // Fallback: pick best word-overlap match if score >= 2
      if (!matched) {
        let bestScore = 1; // require at least 2 overlapping words
        for (const g of goals) {
          const score = overlapScore(g.title, payload.goalTitle);
          if (score > bestScore) { bestScore = score; matched = g; }
        }
      }

      if (matched) goalId = matched.id;
    }

    if (!goalId) {
      return {
        success: false,
        errorMessage: `Could not find a goal matching "${payload.goalTitle}". Check your goals list.`,
      };
    }

    const existing = await storage.getGoal(goalId, action.userId);
    if (!existing) {
      return { success: false, errorMessage: 'Goal not found.' };
    }

    const previousProgress = existing.progressPercent;
    await storage.updateGoal(goalId, action.userId, { progressPercent: payload.newProgress });

    return {
      success: true,
      resultData: {
        goalId,
        goalTitle: existing.title,
        previousProgress,
        newProgress: payload.newProgress,
        progressNote: payload.progressNote ?? null,
      },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Failed to update goal progress',
    };
  }
}

/**
 * Execute financial.alert action — sends a push notification for the financial alert
 * and dispatches an outbound relay event to all configured outbound destinations.
 */
async function executeFinancialAlert(action: AiAction): Promise<ActionExecutionResult> {
  const rawPayload = action.payload as Record<string, unknown>;
  const validation = financialAlertPayloadSchema.safeParse(rawPayload);
  if (!validation.success) {
    return { success: false, errorMessage: `Invalid financial.alert payload: ${validation.error.message}` };
  }
  const payload = validation.data;

  try {
    if (isPushConfigured()) {
      await sendPushToAllUserDevices(action.userId, {
        type: 'alert',
        title: `💰 ${payload.title}`,
        body: payload.details.slice(0, 120),
        url: '/dashboard',
        requireInteraction: false,
      });
    }

    // Dispatch outbound relay for financial alerts (non-blocking)
    setImmediate(async () => {
      try {
        const { dispatchFinancialAlert } = await import('./relay-outbound-service');
        await dispatchFinancialAlert(action.userId, payload.title, payload.details, payload.alertType);
      } catch (relayErr) {
        console.warn('[ai-actions] Financial alert outbound relay failed:', relayErr instanceof Error ? relayErr.message : relayErr);
      }
    });

    return {
      success: true,
      resultData: {
        alertType: payload.alertType,
        title: payload.title,
        details: payload.details,
        amount: payload.amount ?? null,
        merchant: payload.merchant ?? null,
        notificationSent: isPushConfigured(),
      },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Failed to deliver financial alert',
    };
  }
}

function getActionCategory(actionType: string): string {
  const categoryMap: Record<string, string> = {
    [AI_ACTION_TYPES.CALENDAR_CREATE]: AI_ACTION_CATEGORIES.CALENDAR,
    [AI_ACTION_TYPES.CALENDAR_DELETE]: AI_ACTION_CATEGORIES.CALENDAR,
    [AI_ACTION_TYPES.CALENDAR_UPDATE]: AI_ACTION_CATEGORIES.CALENDAR,
    [AI_ACTION_TYPES.EMAIL_SEND]: AI_ACTION_CATEGORIES.EMAIL,
    [AI_ACTION_TYPES.EMAIL_DRAFT]: AI_ACTION_CATEGORIES.EMAIL,
    [AI_ACTION_TYPES.REMINDER_CREATE]: AI_ACTION_CATEGORIES.REMINDER,
    [AI_ACTION_TYPES.PEOPLE_REACH_OUT]: AI_ACTION_CATEGORIES.PEOPLE,
    [AI_ACTION_TYPES.PEOPLE_NOTE]: AI_ACTION_CATEGORIES.PEOPLE,
    [AI_ACTION_TYPES.GOAL_UPDATE]: AI_ACTION_CATEGORIES.GOALS,
    [AI_ACTION_TYPES.GOAL_MILESTONE]: AI_ACTION_CATEGORIES.GOALS,
    [AI_ACTION_TYPES.WEB_SEARCH]: AI_ACTION_CATEGORIES.RESEARCH,
    [AI_ACTION_TYPES.MEMORY_CREATE]: AI_ACTION_CATEGORIES.MEMORY,
    [AI_ACTION_TYPES.FINANCIAL_ALERT]: AI_ACTION_CATEGORIES.FINANCIAL,
    [AI_ACTION_TYPES.INSIGHT_SURFACE]: AI_ACTION_CATEGORIES.SYSTEM,
    [AI_ACTION_TYPES.RELAY_OUTBOUND]: AI_ACTION_CATEGORIES.RELAY,
    [AI_ACTION_TYPES.CHAIN_SEQUENCE]: AI_ACTION_CATEGORIES.SYSTEM,
  };
  return categoryMap[actionType] || AI_ACTION_CATEGORIES.SYSTEM;
}

/**
 * Execute relay outbound action — delivers content to user-configured relay destinations.
 *
 * The `payload` must contain:
 *   - `destination` (string): label of the target relay destination, or 'all' for fan-out
 *   - `content`     (string): the message/text to send
 *   - `type`        (string, optional): 'sms' | 'command' | 'event' — defaults to 'command'
 */
async function executeRelayOutbound(action: AiAction): Promise<ActionExecutionResult> {
  const rawPayload = action.payload as Record<string, unknown>;
  const userId = action.userId;
  const content = (typeof rawPayload?.content === 'string' ? rawPayload.content : null)
    ?? (typeof rawPayload?.message === 'string' ? rawPayload.message : '');
  const targetLabel = typeof rawPayload?.destination === 'string' ? rawPayload.destination : 'all';
  const payloadType = typeof rawPayload?.type === 'string' ? rawPayload.type : 'command';

  if (!content) {
    return { success: false, errorMessage: 'Relay outbound action has no content to send.' };
  }

  try {
    const destinations = await storage.getRelayDestinations(userId);
    if (!destinations || destinations.length === 0) {
      return { success: false, errorMessage: 'No relay destinations configured. Add one in Settings → Relay.' };
    }

    const targets = targetLabel === 'all'
      ? destinations.filter(d => d.enabled)
      : destinations.filter(d => d.enabled && d.label.toLowerCase() === targetLabel.toLowerCase());

    if (targets.length === 0) {
      return {
        success: false,
        errorMessage: `No enabled relay destination matching "${targetLabel}" found.`,
      };
    }

    const extraFields = typeof rawPayload?.extra === 'object' && rawPayload.extra !== null
      ? (rawPayload.extra as Record<string, unknown>)
      : {};
    const relayPayload = {
      type: payloadType,
      source: 'keryx_agent',
      content,
      agentActionId: action.id,
      timestamp: new Date().toISOString(),
      ...extraFields,
    };

    const results: Array<{ label: string; ok: boolean; error?: string }> = [];

    await Promise.allSettled(
      targets.map(async (dest) => {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (dest.apiKey) headers['X-API-Key'] = dest.apiKey;

          const resp = await fetch(dest.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(relayPayload),
            signal: AbortSignal.timeout(8000),
          });

          results.push({ label: dest.label, ok: resp.ok, error: resp.ok ? undefined : `HTTP ${resp.status}` });
        } catch (err) {
          results.push({ label: dest.label, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })
    );

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);

    if (succeeded === 0) {
      return {
        success: false,
        errorMessage: `All relay targets failed: ${failed.map(f => `${f.label}: ${f.error}`).join('; ')}`,
        resultData: { results },
      };
    }

    return {
      success: true,
      resultData: {
        delivered: succeeded,
        failed: failed.length,
        results,
        content: content.slice(0, 200),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[relay-outbound] Execution error:', msg);
    return { success: false, errorMessage: `Relay outbound failed: ${msg}` };
  }
}

/**
 * Approve and execute an action
 */
export async function approveAction(actionId: string, userId: string): Promise<ActionExecutionResult> {
  const action = await storage.getAiAction(actionId, userId);
  if (!action) {
    return { success: false, errorMessage: 'Action not found' };
  }
  
  if (action.status !== AI_ACTION_STATUSES.PENDING) {
    return { success: false, errorMessage: `Action is not pending (current status: ${action.status})` };
  }
  
  // Update to approved before executing
  await storage.updateAiAction(actionId, userId, { 
    status: AI_ACTION_STATUSES.APPROVED 
  });
  
  return await executeAction(action);
}

/**
 * Reject a pending action
 */
export async function rejectAction(actionId: string, userId: string): Promise<boolean> {
  const action = await storage.getAiAction(actionId, userId);
  if (!action || action.status !== AI_ACTION_STATUSES.PENDING) {
    return false;
  }
  
  await storage.updateAiAction(actionId, userId, { 
    status: AI_ACTION_STATUSES.REJECTED 
  });
  
  return true;
}

/**
 * Process user input for actions
 * Main entry point for the action detection and execution flow
 */
export async function processUserInputForActions(
  userId: string,
  userInput: string,
  sourceType: 'voice_input' | 'memory' | 'briefing' | 'manual' | 'discovery' | 'velocity' | 'high_signal' = 'voice_input',
  sourceId?: string,
  contextInfo?: { timezone?: string; userProfile?: string | null },
  minConfidence?: number
): Promise<{ 
  actionDetected: boolean; 
  action?: AiAction; 
  autoExecuted?: boolean;
  executionResult?: ActionExecutionResult;
}> {
  // Build enriched user profile with confirmed AI observations
  let enrichedProfile = contextInfo?.userProfile || '';
  try {
    const { storage } = await import('./storage');
    const confirmedObs = await storage.getConfirmedObservationsText(userId);
    if (confirmedObs) {
      enrichedProfile = enrichedProfile
        ? `${enrichedProfile}\n\nKeryx's confirmed observations about this user:\n${confirmedObs}`
        : `Keryx's confirmed observations about this user:\n${confirmedObs}`;
    }
  } catch (_) {}

  // Detect action from input with user's timezone and profile context
  const detected = await detectActionFromInput(userInput, {
    currentTime: new Date(),
    timezone: contextInfo?.timezone,
    userProfile: enrichedProfile || null,
  });
  
  if (!detected) {
    return { actionDetected: false };
  }

  // Enforce minimum confidence gate before any persistence
  if (minConfidence !== undefined && (detected.confidence ?? 0) < minConfidence) {
    return { actionDetected: false };
  }
  
  // Check user's policy for this action type
  const { policy } = await getActionPolicy(userId, detected.actionType);
  
  if (policy === AI_ACTION_POLICIES.DISABLED) {
    // User has disabled this action type
    return { actionDetected: true };
  }
  
  // Create the action record
  const action = await createPendingAction(
    userId,
    detected,
    sourceType,
    sourceId,
    userInput
  );
  
  if (policy === AI_ACTION_POLICIES.AUTO) {
    // Auto-execute if policy allows
    const executionResult = await executeAction(action);

    // Outbound relay: dispatch auto-executed action result to configured destinations (non-blocking)
    if (executionResult.success) {
      setImmediate(async () => {
        try {
          const { dispatchAutoActionResult } = await import('./relay-outbound-service');
          const summary = typeof executionResult.resultData?.summary === 'string'
            ? executionResult.resultData.summary
            : `${detected.actionType} action "${detected.title}" completed successfully.`;
          await dispatchAutoActionResult(userId, detected.actionType, detected.title, summary);
        } catch { /* non-fatal */ }
      });
    }

    return { 
      actionDetected: true, 
      action, 
      autoExecuted: true,
      executionResult 
    };
  }
  
  // Default: require confirmation
  return { 
    actionDetected: true, 
    action, 
    autoExecuted: false 
  };
}

/**
 * Delete a calendar event by ID — used for rollback compensation.
 * Wraps deleteGoogleCalendarEvent from calendar-service.
 */
export async function deleteCalendarEventById(eventId: string, userId: string): Promise<void> {
  await deleteGoogleCalendarEvent(eventId, userId);
}

export async function getAvailableActionTypes(userId?: string): Promise<{
  actionType: string;
  category: string;
  description: string;
  available: boolean;
  provider?: string;
}[]> {
  // Check integration and data presence in parallel
  const [googleCalendar, outlookCalendar, gmail, outlookMail, people, goals, relayDests, userSettings] = await Promise.all([
    isGoogleCalendarConnected(userId),
    isOutlookConnected(userId),
    isGmailConnected(userId),
    isOutlookMailConnected(userId),
    userId ? storage.getPeople(userId).catch(() => []) : Promise.resolve([]),
    userId ? storage.getGoals(userId).catch(() => []) : Promise.resolve([]),
    userId ? storage.getRelayDestinations(userId).catch(() => []) : Promise.resolve([]),
    userId ? storage.getSettings(userId).catch(() => null) : Promise.resolve(null),
  ]);

  const hasPeople = Array.isArray(people) && people.length > 0;
  const hasGoals = Array.isArray(goals) && goals.length > 0;
  // Financial alert requires both the env config AND the user's per-user Plaid toggle enabled
  const hasFinancialIntegration = !!process.env.PLAID_CLIENT_ID && (userSettings?.plaidEnabled ?? false);
  const hasRelayDestination = Array.isArray(relayDests) && relayDests.some((d) => d.enabled);

  return [
    // Calendar
    {
      actionType: AI_ACTION_TYPES.CALENDAR_CREATE,
      category: AI_ACTION_CATEGORIES.CALENDAR,
      description: 'Create calendar events',
      available: googleCalendar || outlookCalendar,
      provider: googleCalendar ? 'google' : outlookCalendar ? 'outlook' : undefined,
    },
    // Email
    {
      actionType: AI_ACTION_TYPES.EMAIL_SEND,
      category: AI_ACTION_CATEGORIES.EMAIL,
      description: 'Send emails',
      available: gmail || outlookMail,
      provider: gmail ? 'gmail' : outlookMail ? 'outlook' : undefined,
    },
    {
      actionType: AI_ACTION_TYPES.EMAIL_DRAFT,
      category: AI_ACTION_CATEGORIES.EMAIL,
      description: 'Draft emails for review',
      available: gmail || outlookMail,
      provider: gmail ? 'gmail' : outlookMail ? 'outlook' : undefined,
    },
    // Reminders — always available (no dependency)
    {
      actionType: AI_ACTION_TYPES.REMINDER_CREATE,
      category: AI_ACTION_CATEGORIES.REMINDER,
      description: 'Create reminders',
      available: true,
      provider: undefined,
    },
    // People — require at least one contact in the people list
    {
      actionType: AI_ACTION_TYPES.PEOPLE_REACH_OUT,
      category: AI_ACTION_CATEGORIES.PEOPLE,
      description: 'Suggest reaching out to a contact',
      available: hasPeople,
      provider: undefined,
    },
    {
      actionType: AI_ACTION_TYPES.PEOPLE_NOTE,
      category: AI_ACTION_CATEGORIES.PEOPLE,
      description: 'Add a note to a person\'s contact record',
      available: hasPeople,
      provider: undefined,
    },
    // Goals — require at least one active goal
    {
      actionType: AI_ACTION_TYPES.GOAL_UPDATE,
      category: AI_ACTION_CATEGORIES.GOALS,
      description: 'Update goal progress based on memory evidence',
      available: hasGoals,
      provider: undefined,
    },
    {
      actionType: AI_ACTION_TYPES.GOAL_MILESTONE,
      category: AI_ACTION_CATEGORIES.GOALS,
      description: 'Suggest adding or completing a milestone',
      available: hasGoals,
      provider: undefined,
    },
    // Research — requires Tavily API key
    {
      actionType: AI_ACTION_TYPES.WEB_SEARCH,
      category: AI_ACTION_CATEGORIES.RESEARCH,
      description: 'Search the web and surface results',
      available: !!process.env.TAVILY_API_KEY,
      provider: 'tavily',
    },
    // Memory — always available (pure AI pipeline, no external deps)
    {
      actionType: AI_ACTION_TYPES.MEMORY_CREATE,
      category: AI_ACTION_CATEGORIES.MEMORY,
      description: 'Create a new memory log entry',
      available: true,
      provider: undefined,
    },
    // Financial — requires Plaid integration
    {
      actionType: AI_ACTION_TYPES.FINANCIAL_ALERT,
      category: AI_ACTION_CATEGORIES.FINANCIAL,
      description: 'Surface a financial pattern or spending alert',
      available: hasFinancialIntegration,
      provider: 'plaid',
    },
    // System
    {
      actionType: AI_ACTION_TYPES.INSIGHT_SURFACE,
      category: AI_ACTION_CATEGORIES.SYSTEM,
      description: 'Proactive insight surfaced by Keryx',
      available: true,
      provider: undefined,
    },
    // Relay — requires at least one enabled destination
    {
      actionType: AI_ACTION_TYPES.RELAY_OUTBOUND,
      category: AI_ACTION_CATEGORIES.RELAY,
      description: 'Send content via outbound relay',
      available: hasRelayDestination,
      provider: undefined,
    },
  ];
}
