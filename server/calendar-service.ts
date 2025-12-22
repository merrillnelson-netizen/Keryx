/**
 * Unified Calendar Service for Google Calendar and Outlook Integration
 * Fetches events around a given timestamp to enrich meeting memories
 * Supports both Google Calendar and Microsoft Outlook via Replit connectors
 * 
 * Integration: google-calendar and outlook connectors via Replit
 */

import { google, calendar_v3 } from 'googleapis';
import { 
  isOutlookConnected, 
  getOutlookEventsAroundTime, 
  getOutlookTodaysEvents, 
  findOutlookRelevantEvent,
  createOutlookCalendarEvent,
  type OutlookCalendarEvent 
} from './outlook-calendar-service';

let googleConnectionSettings: any;

export type CalendarProvider = 'google' | 'outlook' | null;

async function getAccessToken(): Promise<string> {
  if (googleConnectionSettings && googleConnectionSettings.settings?.expires_at && 
      new Date(googleConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    return googleConnectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Calendar connection not available');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  googleConnectionSettings = data.items?.[0];

  const accessToken = googleConnectionSettings?.settings?.access_token || 
                      googleConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!googleConnectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEvent {
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
 * Check if Google Calendar is connected and available
 */
async function isGoogleCalendarConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if any calendar (Google or Outlook) is connected
 * Returns the connected provider or null if neither is connected
 */
export async function getConnectedCalendarProvider(): Promise<CalendarProvider> {
  const [googleConnected, outlookConnected] = await Promise.all([
    isGoogleCalendarConnected(),
    isOutlookConnected()
  ]);
  
  // Prefer Google if both are connected
  if (googleConnected) return 'google';
  if (outlookConnected) return 'outlook';
  return null;
}

/**
 * Check if any calendar is connected (backwards compatible)
 */
export async function isCalendarConnected(): Promise<boolean> {
  const provider = await getConnectedCalendarProvider();
  return provider !== null;
}

/**
 * Fetch Google calendar events around a given timestamp
 */
async function getGoogleEventsAroundTime(
  timestamp: Date,
  windowMinutes: number = 30
): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient();
    
    const timeMin = new Date(timestamp.getTime() - windowMinutes * 60 * 1000);
    const timeMax = new Date(timestamp.getTime() + windowMinutes * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10,
    });

    const events = response.data.items || [];
    
    return events.map(event => ({
      id: event.id || '',
      title: event.summary || 'Untitled Event',
      description: event.description || undefined,
      startTime: new Date(event.start?.dateTime || event.start?.date || timestamp),
      endTime: new Date(event.end?.dateTime || event.end?.date || timestamp),
      attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
      location: event.location || undefined,
      meetingLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch Google calendar events:', error);
    return [];
  }
}

/**
 * Fetch calendar events around a given timestamp (uses connected provider)
 */
export async function getEventsAroundTime(
  timestamp: Date,
  windowMinutes: number = 30
): Promise<CalendarEvent[]> {
  const provider = await getConnectedCalendarProvider();
  
  if (provider === 'google') {
    return getGoogleEventsAroundTime(timestamp, windowMinutes);
  } else if (provider === 'outlook') {
    return getOutlookEventsAroundTime(timestamp, windowMinutes);
  }
  
  return [];
}

/**
 * Find the most relevant event for a given timestamp
 * Uses whichever calendar is connected (Google or Outlook)
 */
export async function findRelevantEvent(timestamp: Date): Promise<CalendarEvent | null> {
  const provider = await getConnectedCalendarProvider();
  
  if (provider === 'outlook') {
    return findOutlookRelevantEvent(timestamp);
  }
  
  // Default to Google behavior
  const events = await getGoogleEventsAroundTime(timestamp, 60);
  
  if (events.length === 0) return null;
  
  // Find events that contain the timestamp (currently happening)
  const currentEvents = events.filter(event => 
    event.startTime <= timestamp && event.endTime >= timestamp
  );
  
  if (currentEvents.length > 0) {
    return currentEvents[0];
  }
  
  // Otherwise return the closest event
  return events.reduce((closest, event) => {
    const closestDiff = Math.min(
      Math.abs(closest.startTime.getTime() - timestamp.getTime()),
      Math.abs(closest.endTime.getTime() - timestamp.getTime())
    );
    const eventDiff = Math.min(
      Math.abs(event.startTime.getTime() - timestamp.getTime()),
      Math.abs(event.endTime.getTime() - timestamp.getTime())
    );
    return eventDiff < closestDiff ? event : closest;
  });
}

/**
 * Create a new calendar event (uses connected provider)
 * Returns the created event or null if creation failed
 */
export async function createCalendarEvent(
  title: string,
  startDateTime: string,
  endDateTime: string,
  options?: {
    attendees?: string[];
    location?: string;
    description?: string;
  }
): Promise<CalendarEvent | null> {
  const provider = await getConnectedCalendarProvider();
  
  if (provider === 'outlook') {
    return createOutlookCalendarEvent(title, startDateTime, endDateTime, options);
  }
  
  // Default to Google Calendar
  return createGoogleCalendarEvent(title, startDateTime, endDateTime, options);
}

/**
 * Create a new Google calendar event
 */
async function createGoogleCalendarEvent(
  title: string,
  startDateTime: string,
  endDateTime: string,
  options?: {
    attendees?: string[];
    location?: string;
    description?: string;
  }
): Promise<CalendarEvent | null> {
  try {
    console.log('[Calendar] Creating Google event:', { title, startDateTime, endDateTime, options });
    
    const calendar = await getCalendarClient();
    console.log('[Calendar] Got Google calendar client successfully');
    
    // Ensure datetime strings are valid ISO format
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('[Calendar] Invalid date format:', { startDateTime, endDateTime });
      return null;
    }
    
    const event: calendar_v3.Schema$Event = {
      summary: title,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    if (options?.description) {
      event.description = options.description;
    }

    if (options?.location) {
      event.location = options.location;
    }

    if (options?.attendees && options.attendees.length > 0) {
      // Only add attendees that look like email addresses
      const validEmails = options.attendees.filter(a => a.includes('@'));
      if (validEmails.length > 0) {
        event.attendees = validEmails.map(email => ({ email }));
      }
    }

    console.log('[Calendar] Inserting event:', JSON.stringify(event, null, 2));
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'none', // Don't send invite emails automatically
    });

    console.log('[Calendar] Event created successfully:', response.data.id);
    
    const created = response.data;
    return {
      id: created.id || '',
      title: created.summary || title,
      description: created.description || undefined,
      startTime: new Date(created.start?.dateTime || startDateTime),
      endTime: new Date(created.end?.dateTime || endDateTime),
      attendees: created.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
      location: created.location || undefined,
      meetingLink: created.hangoutLink || undefined,
    };
  } catch (error: any) {
    console.error('[Calendar] Failed to create event:', {
      message: error?.message,
      code: error?.code,
      errors: error?.errors,
      response: error?.response?.data,
    });
    return null;
  }
}

/**
 * Check if a similar event already exists in the calendar
 * Returns the existing event if found, null otherwise
 */
export async function findDuplicateEvent(
  title: string,
  startDateTime: string,
  toleranceMinutes: number = 30
): Promise<CalendarEvent | null> {
  try {
    const calendar = await getCalendarClient();
    const startTime = new Date(startDateTime);
    
    // Search window around the event time
    const timeMin = new Date(startTime.getTime() - toleranceMinutes * 60 * 1000);
    const timeMax = new Date(startTime.getTime() + toleranceMinutes * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      maxResults: 20,
      q: title, // Search for events with similar title
    });

    const events = response.data.items || [];
    
    // Find event with matching or similar title
    const titleWords = title.toLowerCase().split(' ').filter(w => w.length > 2);
    
    for (const event of events) {
      const eventTitle = (event.summary || '').toLowerCase();
      // Check if titles share significant words
      const matchingWords = titleWords.filter(word => eventTitle.includes(word));
      if (matchingWords.length >= Math.min(2, titleWords.length)) {
        return {
          id: event.id || '',
          title: event.summary || 'Untitled Event',
          description: event.description || undefined,
          startTime: new Date(event.start?.dateTime || event.start?.date || startTime),
          endTime: new Date(event.end?.dateTime || event.end?.date || startTime),
          attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
          location: event.location || undefined,
          meetingLink: event.hangoutLink || undefined,
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Failed to check for duplicate event:', error);
    return null;
  }
}

/**
 * Get upcoming events for today (uses connected provider)
 */
export async function getTodaysEvents(): Promise<CalendarEvent[]> {
  const provider = await getConnectedCalendarProvider();
  
  if (provider === 'outlook') {
    return getOutlookTodaysEvents();
  }
  
  // Default to Google Calendar
  return getGoogleTodaysEvents();
}

/**
 * Get today's Google calendar events
 */
async function getGoogleTodaysEvents(): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient();
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const events = response.data.items || [];
    
    return events.map(event => ({
      id: event.id || '',
      title: event.summary || 'Untitled Event',
      description: event.description || undefined,
      startTime: new Date(event.start?.dateTime || event.start?.date || now),
      endTime: new Date(event.end?.dateTime || event.end?.date || now),
      attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
      location: event.location || undefined,
      meetingLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch today\'s Google events:', error);
    return [];
  }
}
