/**
 * Outlook Calendar Service for Microsoft Graph Calendar Integration
 * Fetches events around a given timestamp to enrich meeting memories
 * 
 * Integration: Outlook connector via Replit
 */

import { Client } from '@microsoft/microsoft-graph-client';

let outlookConnectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (outlookConnectionSettings && outlookConnectionSettings.settings?.expires_at && 
      new Date(outlookConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    return outlookConnectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Outlook connection not available');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  outlookConnectionSettings = data.items?.[0];

  const accessToken = outlookConnectionSettings?.settings?.access_token || 
                      outlookConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!outlookConnectionSettings || !accessToken) {
    throw new Error('Outlook not connected');
  }
  return accessToken;
}

async function getOutlookClient(): Promise<Client> {
  const accessToken = await getAccessToken();

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
export async function isOutlookConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch Outlook calendar events around a given timestamp
 * Returns events that overlap with the time window (±30 minutes by default)
 */
export async function getOutlookEventsAroundTime(
  timestamp: Date,
  windowMinutes: number = 30
): Promise<OutlookCalendarEvent[]> {
  try {
    const client = await getOutlookClient();
    
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
export async function getOutlookTodaysEvents(): Promise<OutlookCalendarEvent[]> {
  try {
    const client = await getOutlookClient();
    
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
 * Returns the best matching event (during or closest to the timestamp)
 */
export async function findOutlookRelevantEvent(timestamp: Date): Promise<OutlookCalendarEvent | null> {
  const events = await getOutlookEventsAroundTime(timestamp, 60);
  
  if (events.length === 0) return null;
  
  // Find event that contains the timestamp, or the closest one
  for (const event of events) {
    if (timestamp >= event.startTime && timestamp <= event.endTime) {
      return event;
    }
  }
  
  // Return closest event if none contains the timestamp
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
  }
): Promise<OutlookCalendarEvent | null> {
  try {
    const client = await getOutlookClient();
    
    const eventData: any = {
      subject: title,
      start: {
        dateTime: startDateTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'UTC'
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
  } catch (error) {
    console.error('Failed to create Outlook calendar event:', error);
    return null;
  }
}
