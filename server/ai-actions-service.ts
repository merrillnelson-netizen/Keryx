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
  type EmailSendPayload,
  calendarCreatePayloadSchema,
  emailSendPayloadSchema,
} from "@shared/schema";
import { createCalendarEvent, isGoogleCalendarConnected } from "./calendar-service";
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
 * Only includes actions that are actually implemented
 */
export const ACTION_DEFINITIONS = {
  [AI_ACTION_TYPES.CALENDAR_CREATE]: {
    category: AI_ACTION_CATEGORIES.CALENDAR,
    description: 'Create a new calendar event',
    examples: ['schedule a meeting', 'add an appointment', 'book time for', 'set up a call'],
    supported: true,
  },
  [AI_ACTION_TYPES.EMAIL_SEND]: {
    category: AI_ACTION_CATEGORIES.EMAIL,
    description: 'Send a new email',
    examples: ['send an email to', 'email them about', 'write to', 'message them'],
    supported: true,
  },
  [AI_ACTION_TYPES.REMINDER_CREATE]: {
    category: AI_ACTION_CATEGORIES.REMINDER,
    description: 'Create a reminder',
    examples: ['remind me to', 'set a reminder for', "don't let me forget"],
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
  }
): Promise<DetectedAction | null> {
  try {
    const currentTime = contextInfo?.currentTime || new Date();
    const providers = contextInfo?.connectedProviders || {};
    const userTimezone = contextInfo?.timezone || 'UTC';
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that detects actionable requests from user input. Analyze the text to determine if the user is asking you to perform an action on their behalf.

AVAILABLE ACTIONS:
1. calendar.create - Create a calendar event (schedule meeting, book appointment, set up call)
2. email.send - Send a new email to someone
3. reminder.create - Set a reminder for the user

NOT SUPPORTED (do not detect these):
- calendar.update - Updating existing events is not yet supported
- calendar.delete - Deleting events is not yet supported
- email.reply - Replying to emails is not yet supported

CURRENT CONTEXT:
- Current time: ${currentTime.toISOString()}
- User's timezone: ${userTimezone}
- Calendar provider: ${providers.calendar || 'not connected'}
- Email provider: ${providers.email || 'not connected'}

DETECTION RULES:
- Look for imperative phrases like "schedule", "send", "remind me", "set up", "book", "email"
- Look for future-oriented requests that require external action
- Do NOT flag simple memory logging or queries as actions
- Do NOT flag reflective statements or observations

If an action is detected, extract:
1. The specific action type
2. All relevant parameters (who, what, when, where)
3. Parse relative times into absolute datetime (e.g., "tomorrow at 3pm", "next Monday")
4. Extract email addresses if mentioned, or note the person's name for lookup

Respond with JSON:
{
  "detected": boolean,
  "actionType": "calendar.create" | "email.send" | "reminder.create" | null,
  "actionCategory": "calendar" | "email" | "reminder" | null,
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
    
    // For email.send:
    "to": ["email or name"],
    "subject": "Email subject",
    "body": "Email body content"
    
    // For reminder.create:
    "title": "Reminder title",
    "dueDateTime": "ISO 8601 datetime",
    "notes": "optional notes"
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
  sourceType: 'voice_input' | 'memory' | 'briefing' | 'manual',
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
          url: '/actions',
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
      case AI_ACTION_TYPES.EMAIL_SEND:
        result = await executeEmailSend(action);
        break;
      case AI_ACTION_TYPES.REMINDER_CREATE:
        result = await executeReminderCreate(action);
        break;
      default:
        // Provide helpful error messages for not-yet-implemented actions
        const notImplementedActions: Record<string, string> = {
          'calendar.update': 'Updating existing calendar events is not yet supported. Please modify the event directly in your calendar app.',
          'calendar.delete': 'Deleting calendar events is not yet supported. Please cancel the event directly in your calendar app.',
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
      }
    );
    
    if (!createdEvent) {
      return { success: false, errorMessage: 'Failed to create calendar event' };
    }
    
    return {
      success: true,
      resultData: { eventId: createdEvent.id, title: createdEvent.title },
      rollbackData: { eventId: createdEvent.id, action: 'delete' },
    };
  } catch (error) {
    return { 
      success: false, 
      errorMessage: error instanceof Error ? error.message : 'Calendar creation failed' 
    };
  }
}

/**
 * Execute email send action
 */
async function executeEmailSend(action: AiAction): Promise<ActionExecutionResult> {
  const payload = action.payload as EmailSendPayload;
  
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
      const isConnected = await isGmailConnected();
      if (!isConnected) {
        return { success: false, errorMessage: 'Gmail not connected' };
      }
      
      const result = await sendGmailEmail({
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
      const isConnected = await isOutlookMailConnected();
      if (!isConnected) {
        return { success: false, errorMessage: 'Outlook Mail not connected' };
      }
      
      const result = await sendOutlookEmail({
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
  // Reminders are implemented as calendar events for now
  const payload = action.payload as any;
  
  // Convert reminder to calendar event
  const reminderPayload: CalendarCreatePayload = {
    summary: `[Reminder] ${payload.title}`,
    description: payload.notes || '',
    startDateTime: payload.dueDateTime,
    endDateTime: payload.dueDateTime, // Same time - it's a reminder
  };
  
  // Create as calendar event
  const modifiedAction = { ...action, payload: reminderPayload };
  return await executeCalendarCreate(modifiedAction as AiAction);
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
  sourceType: 'voice_input' | 'memory' | 'briefing' | 'manual' = 'voice_input',
  sourceId?: string,
  contextInfo?: { timezone?: string }
): Promise<{ 
  actionDetected: boolean; 
  action?: AiAction; 
  autoExecuted?: boolean;
  executionResult?: ActionExecutionResult;
}> {
  // Detect action from input with user's timezone context
  const detected = await detectActionFromInput(userInput, {
    currentTime: new Date(),
    timezone: contextInfo?.timezone,
  });
  
  if (!detected) {
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
 * Get available action types with connection status
 */
export async function getAvailableActionTypes(): Promise<{
  actionType: string;
  category: string;
  description: string;
  available: boolean;
  provider?: string;
}[]> {
  const [googleCalendar, outlookCalendar, gmail, outlookMail] = await Promise.all([
    isGoogleCalendarConnected(),
    isOutlookConnected(),
    isGmailConnected(),
    isOutlookMailConnected(),
  ]);
  
  // Only return supported action types
  return [
    {
      actionType: AI_ACTION_TYPES.CALENDAR_CREATE,
      category: AI_ACTION_CATEGORIES.CALENDAR,
      description: 'Create calendar events',
      available: googleCalendar || outlookCalendar,
      provider: googleCalendar ? 'google' : outlookCalendar ? 'outlook' : undefined,
    },
    {
      actionType: AI_ACTION_TYPES.EMAIL_SEND,
      category: AI_ACTION_CATEGORIES.EMAIL,
      description: 'Send emails',
      available: gmail || outlookMail,
      provider: gmail ? 'gmail' : outlookMail ? 'outlook' : undefined,
    },
    {
      actionType: AI_ACTION_TYPES.REMINDER_CREATE,
      category: AI_ACTION_CATEGORIES.REMINDER,
      description: 'Create reminders',
      available: googleCalendar || outlookCalendar,
      provider: googleCalendar ? 'google' : outlookCalendar ? 'outlook' : undefined,
    },
  ];
}
