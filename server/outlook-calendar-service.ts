/**
 * Outlook Calendar Service for Microsoft Graph Calendar Integration
 * Fetches events around a given timestamp to enrich meeting memories
 * Uses self-contained OAuth token storage (oauth-token-manager)
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { getAccessToken as getOAuthAccessToken, hasValidToken } from './oauth-token-manager';

async function getAccessToken(userId: string): Promise<string> {
  const token = await getOAuthAccessToken(userId, 'microsoft');
  if (!token) throw new Error('Outlook not connected');
  return token;
}

async function getOutlookClient(userId: string): Promise<Client> {
  const accessToken = await getAccessToken(userId);

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export interface OutlookCalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
  location?: string;
  meetingLink?: string;
}

/**
 * Check if Outlook Calendar is connected and available
 */
export async function isOutlookConnected(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    return await hasValidToken(userId, 'microsoft');
  } catch {
    return false;
  }
}

/**
 * Fetch Outlook calendar events around a given timestamp
 */
export async function getOutlookEventsAroundTime(
  timestamp: Date,
  windowMinutes: number = 30,
  userId?: string
): Promise<OutlookCalendarEvent[]> {
  if (!userId) return [];
  try {
    const client = await getOutlookClient(userId);
    
    const timeMin = new Date(timestamp.getTime() - windowMinutes * 60 * 1000);
    const timeMax = new Date(timestamp.getTime() + windowMinutes * 60 * 1000);

    const response = await client
      .api('/me/calendar/calendarView')
      .query({
        startDateTime: timeMin.toISOString(),
        endDateTime: timeMax.toISOString(),
        $orderby: 'start/dateTime',
        $top: 10
      })
      .get();

    const events = response.value || [];
    
    return events.map((event: any) => ({
      id: event.id || '',
      title: event.subject || 'Untitled Event',
      description: event.bodyPreview || undefined,
      startTime: new Date(event.start?.dateTime || timestamp),
      endTime: new Date(event.end?.dateTime || timestamp),
      attendees: event.attendees?.map((a: any) => a.emailAddress?.name || a.emailAddress?.address || '').filter(Boolean),
      location: event.location?.displayName || undefined,
      meetingLink: event.onlineMeeting?.joinUrl || undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch Outlook calendar events:', error);
    return [];
  }
}

/**
 * Get today's Outlook calendar events
 */
export async function getOutlookTodaysEvents(userId?: string): Promise<OutlookCalendarEvent[]> {
  if (!userId) return [];
  try {
    const client = await getOutlookClient(userId);
    
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const response = await client
      .api('/me/calendar/calendarView')
      .query({
        startDateTime: startOfDay.toISOString(),
        endDateTime: endOfDay.toISOString(),
        $orderby: 'start/dateTime',
        $top: 50
      })
      .get();

    const events = response.value || [];
    
    return events.map((event: any) => ({
      id: event.id || '',
      title: event.subject || 'Untitled Event',
      description: event.bodyPreview || undefined,
      startTime: new Date(event.start?.dateTime || new Date()),
      endTime: new Date(event.end?.dateTime || new Date()),
      attendees: event.attendees?.map((a: any) => a.emailAddress?.name || a.emailAddress?.address || '').filter(Boolean),
      location: event.location?.displayName || undefined,
      meetingLink: event.onlineMeeting?.joinUrl || undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch Outlook today\'s events:', error);
    return [];
  }
}

/**
 * Find a relevant Outlook calendar event for a memory timestamp
 */
export async function findOutlookRelevantEvent(timestamp: Date, userId?: string): Promise<OutlookCalendarEvent | null> {
  const events = await getOutlookEventsAroundTime(timestamp, 60, userId);
  
  if (events.length === 0) return null;
  
  for (const event of events) {
    if (timestamp >= event.startTime && timestamp <= event.endTime) {
      return event;
    }
  }
  
  return events[0];
}

/**
 * Create a new Outlook calendar event
 */
export async function createOutlookCalendarEvent(
  title: string,
  startDateTime: string,
  endDateTime: string,
  options?: {
    attendees?: string[];
    location?: string;
    description?: string;
    timezone?: string;
    userId?: string;
  }
): Promise<OutlookCalendarEvent | null> {
  const userId = options?.userId;
  if (!userId) return null;
  try {
    const client = await getOutlookClient(userId);
    
    const userTimezone = options?.timezone || 'UTC';
    
    const formatLocalDateTime = (dateStr: string): string => {
      if (/[+-]\d{2}:\d{2}$/.test(dateStr)) {
        return dateStr.slice(0, -6);
      }
      if (dateStr.endsWith('Z')) {
        return dateStr.slice(0, -1);
      }
      return dateStr;
    };
    
    const eventData: Record<string, unknown> = {
      subject: title,
      start: {
        dateTime: formatLocalDateTime(startDateTime),
        timeZone: userTimezone
      },
      end: {
        dateTime: formatLocalDateTime(endDateTime),
        timeZone: userTimezone
      }
    };

    if (options?.location) {
      eventData.location = { displayName: options.location };
    }

    if (options?.description) {
      eventData.body = {
        contentType: 'text',
        content: options.description
      };
    }

    if (options?.attendees && options.attendees.length > 0) {
      eventData.attendees = options.attendees
        .filter(email => email.includes('@'))
        .map(email => ({
          emailAddress: { address: email },
          type: 'required'
        }));
    }

    const response = await client
      .api('/me/calendar/events')
      .post(eventData);
    
    return {
      id: response.id,
      title: response.subject || title,
      description: response.bodyPreview || options?.description,
      startTime: new Date(startDateTime),
      endTime: new Date(endDateTime),
      attendees: options?.attendees,
      location: options?.location,
      meetingLink: response.onlineMeeting?.joinUrl,
    };
  } catch (error: any) {
    const detail = error?.body?.error?.message || error?.message || 'Unknown error';
    console.error('Failed to create Outlook calendar event:', error);
    throw new Error(`Outlook Calendar error: ${detail}`);
  }
}

/**
 * Delete an Outlook calendar event by ID.
 * Used for rollback compensation after a calendar.create action.
 */
export async function deleteOutlookCalendarEvent(eventId: string, userId: string): Promise<void> {
  const client = await getOutlookClient(userId);
  await client.api(`/me/calendar/events/${eventId}`).delete();
}
