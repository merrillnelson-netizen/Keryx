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

interface ReplitConnectorSettings {
  settings?: {
    access_token?: string;
    expires_at?: string;
    oauth?: {
      credentials?: {
        access_token?: string;
      };
    };
  };
}

/**
 * Parse a date string correctly, handling all-day events vs timed events.
 * All-day events only have a date (YYYY-MM-DD) and should be treated as local dates.
 * Timed events have full ISO datetime strings with timezone info.
 */
function parseCalendarDate(dateTime: string | null | undefined, date: string | null | undefined, fallback: Date): Date {
  // Timed event - use the datetime directly (includes timezone info)
  if (dateTime) {
    return new Date(dateTime);
  }
  
  // All-day event - parse as local date to avoid timezone shift issues
  // YYYY-MM-DD format, parsed as local midnight instead of UTC
  if (date) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0); // Noon local time to avoid day boundary issues
  }
  
  return fallback;
}

let googleConnectionSettings: ReplitConnectorSettings | null = null;
let lastTokenFetch: number = 0;
const TOKEN_CACHE_TTL_MS = 30 * 1000; // Cache tokens for 30 seconds max to ensure freshness

export type CalendarProvider = 'google' | 'outlook' | null;

export function clearGoogleCalendarTokenCache(): void {
  googleConnectionSettings = null;
  lastTokenFetch = 0;
}

async function getAccessToken(forceRefresh: boolean = false): Promise<string> {
  const now = Date.now();
  
  // Use cached token if it's fresh and not forcing refresh
  if (!forceRefresh && 
      googleConnectionSettings && 
      googleConnectionSettings.settings?.access_token &&
      (now - lastTokenFetch) < TOKEN_CACHE_TTL_MS) {
    // Also check if token hasn't expired according to its expiry time
    const expiresAt = googleConnectionSettings.settings?.expires_at;
    if (!expiresAt || new Date(expiresAt).getTime() > now + 60000) { // 1 minute buffer
      return googleConnectionSettings.settings.access_token;
    }
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
  lastTokenFetch = now;

  const accessToken = googleConnectionSettings?.settings?.access_token || 
                      googleConnectionSettings?.settings?.oauth?.credentials?.access_token;
  const expiresAt = googleConnectionSettings?.settings?.expires_at;

  if (!googleConnectionSettings || !accessToken) {
    console.error('[Calendar] Google Calendar not connected or no access token. Connection data:', {
      hasItems: !!data.items?.length,
      hasSettings: !!googleConnectionSettings?.settings,
      hasToken: !!accessToken
    });
    throw new Error('Google Calendar not connected');
  }
  
  return accessToken;
}

async function getCalendarClient(forceRefresh: boolean = false): Promise<calendar_v3.Calendar> {
  const accessToken = await getAccessToken(forceRefresh);

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
export async function isGoogleCalendarConnected(): Promise<boolean> {
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
  windowMinutes: number = 30,
  retryCount: number = 0
): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(retryCount > 0);
    
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
      startTime: parseCalendarDate(event.start?.dateTime, event.start?.date, timestamp),
      endTime: parseCalendarDate(event.end?.dateTime, event.end?.date, timestamp),
      attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
      location: event.location || undefined,
      meetingLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || undefined,
    }));
  } catch (error: any) {
    // Retry once with fresh token on 401 Unauthorized
    if (error?.code === 401 && retryCount === 0) {
      clearGoogleCalendarTokenCache();
      return getGoogleEventsAroundTime(timestamp, windowMinutes, 1);
    }
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
    timezone?: string;
  }
): Promise<CalendarEvent | null> {
  const provider = await getConnectedCalendarProvider();
  // Use provided timezone or default to UTC
  const userTimezone = options?.timezone || 'UTC';
  
  if (provider === 'outlook') {
    return createOutlookCalendarEvent(title, startDateTime, endDateTime, { ...options, timezone: userTimezone });
  }
  
  // Default to Google Calendar
  return createGoogleCalendarEvent(title, startDateTime, endDateTime, { ...options, timezone: userTimezone });
}

/**
 * Create a new Google calendar event with retry on auth failure
 */
async function createGoogleCalendarEvent(
  title: string,
  startDateTime: string,
  endDateTime: string,
  options?: {
    attendees?: string[];
    location?: string;
    description?: string;
    timezone?: string;
  },
  retryCount: number = 0
): Promise<CalendarEvent | null> {
  try {
    // Force refresh token on retry
    const calendar = await getCalendarClient(retryCount > 0);
    
    // Use the user's timezone for proper time interpretation
    const userTimezone = options?.timezone || 'UTC';
    
    // Parse the datetime - keep original time, don't convert to UTC
    // The datetime string should be in format like "2025-01-03T11:00:00" (local time)
    // Google Calendar API will interpret it in the specified timezone
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('[Calendar] Invalid date format:', { startDateTime, endDateTime });
      return null;
    }
    
    // Format datetime for Google Calendar: use the original local time string
    // If startDateTime already has timezone info, use it directly
    // Otherwise, we need to format it without the Z suffix
    const formatLocalDateTime = (dateStr: string, date: Date): string => {
      // If it already has timezone offset (e.g., +07:00), use as-is
      if (/[+-]\d{2}:\d{2}$/.test(dateStr)) {
        return dateStr;
      }
      // If it's a plain datetime (no Z, no offset), use as-is
      if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        return dateStr;
      }
      // Otherwise, format as local time in YYYY-MM-DDTHH:mm:ss format
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    };
    
    const event: calendar_v3.Schema$Event = {
      summary: title,
      start: {
        dateTime: formatLocalDateTime(startDateTime, startDate),
        timeZone: userTimezone,
      },
      end: {
        dateTime: formatLocalDateTime(endDateTime, endDate),
        timeZone: userTimezone,
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

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'none', // Don't send invite emails automatically
    });

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
    // Retry once with fresh token on 401 Unauthorized
    if (error?.code === 401 && retryCount === 0) {
      clearGoogleCalendarTokenCache();
      return createGoogleCalendarEvent(title, startDateTime, endDateTime, options, 1);
    }
    
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
  toleranceMinutes: number = 30,
  retryCount: number = 0
): Promise<CalendarEvent | null> {
  try {
    const calendar = await getCalendarClient(retryCount > 0);
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
          startTime: parseCalendarDate(event.start?.dateTime, event.start?.date, startTime),
          endTime: parseCalendarDate(event.end?.dateTime, event.end?.date, startTime),
          attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
          location: event.location || undefined,
          meetingLink: event.hangoutLink || undefined,
        };
      }
    }
    
    return null;
  } catch (error: any) {
    // Retry once with fresh token on 401 Unauthorized
    if (error?.code === 401 && retryCount === 0) {
      clearGoogleCalendarTokenCache();
      return findDuplicateEvent(title, startDateTime, toleranceMinutes, 1);
    }
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
async function getGoogleTodaysEvents(retryCount: number = 0): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(retryCount > 0);
    
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
      startTime: parseCalendarDate(event.start?.dateTime, event.start?.date, now),
      endTime: parseCalendarDate(event.end?.dateTime, event.end?.date, now),
      attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
      location: event.location || undefined,
      meetingLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || undefined,
    }));
  } catch (error: any) {
    // Retry once with fresh token on 401 Unauthorized
    if (error?.code === 401 && retryCount === 0) {
      clearGoogleCalendarTokenCache();
      return getGoogleTodaysEvents(1);
    }
    console.error('Failed to fetch today\'s Google events:', error);
    return [];
  }
}

/**
 * Get upcoming calendar events for the next N days
 * Used for extracting travel/event insights for contextual discoveries
 */
export async function getUpcomingEvents(days: number = 14): Promise<CalendarEvent[]> {
  const provider = await getConnectedCalendarProvider();
  
  if (provider === 'outlook') {
    return getOutlookUpcomingEvents(days);
  }
  
  // Default to Google Calendar
  return getGoogleUpcomingEvents(days);
}

async function getGoogleUpcomingEvents(days: number = 14, retryCount: number = 0): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(retryCount > 0);
    
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const events = response.data.items || [];

    const activeEvents = events.filter(event => {
      if (event.status === 'cancelled') return false;
      const userRsvp = event.attendees?.find(a => a.self);
      if (userRsvp?.responseStatus === 'declined') return false;
      return true;
    });

    return activeEvents.map(event => ({
      id: event.id || '',
      title: event.summary || 'Untitled Event',
      description: event.description || undefined,
      startTime: parseCalendarDate(event.start?.dateTime, event.start?.date, now),
      endTime: parseCalendarDate(event.end?.dateTime, event.end?.date, now),
      attendees: event.attendees?.map(a => a.displayName || a.email || '').filter(Boolean),
      location: event.location || undefined,
      meetingLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || undefined,
    }));
  } catch (error: any) {
    if (error?.code === 401 && retryCount === 0) {
      clearGoogleCalendarTokenCache();
      return getGoogleUpcomingEvents(days, 1);
    }
    console.error('Failed to fetch upcoming Google events:', error);
    return [];
  }
}

async function getOutlookUpcomingEvents(days: number = 14): Promise<CalendarEvent[]> {
  try {
    const connected = await isOutlookConnected();
    if (!connected) return [];
    
    const now = new Date();
    const windowMinutes = days * 24 * 60;
    return getOutlookEventsAroundTime(now, windowMinutes);
  } catch (error) {
    console.error('Failed to fetch upcoming Outlook events:', error);
    return [];
  }
}
