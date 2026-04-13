/**
 * Unified Calendar Service for Google Calendar and Outlook Integration
 * Fetches events around a given timestamp to enrich meeting memories
 * Supports both Google Calendar and Microsoft Outlook via self-contained OAuth
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
import { getAccessToken as getOAuthAccessToken, hasValidToken } from './oauth-token-manager';

/**
 * Parse a date string correctly, handling all-day events vs timed events.
 */
function parseCalendarDate(dateTime: string | null | undefined, date: string | null | undefined, fallback: Date): Date {
  if (dateTime) {
    return new Date(dateTime);
  }
  if (date) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  return fallback;
}

export type CalendarProvider = 'google' | 'outlook' | null;

// userId context — set per-request via setCurrentUserId()
let currentUserId: string | null = null;

export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
}

export function clearGoogleCalendarTokenCache(): void {
  // No-op: token caching is now handled in oauth-token-manager
}

async function getAccessToken(userId?: string): Promise<string> {
  const uid = userId || currentUserId;
  if (!uid) throw new Error('No user context for calendar');

  const token = await getOAuthAccessToken(uid, 'google');
  if (!token) throw new Error('Google Calendar not connected');
  return token;
}

async function getCalendarClient(userId?: string): Promise<calendar_v3.Calendar> {
  const accessToken = await getAccessToken(userId);

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

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
 * Check if Google Calendar is connected for a given user
 */
export async function isGoogleCalendarConnected(userId?: string): Promise<boolean> {
  const uid = userId || currentUserId;
  if (!uid) return false;
  try {
    return await hasValidToken(uid, 'google');
  } catch {
    return false;
  }
}

/**
 * Check if any calendar (Google or Outlook) is connected
 */
export async function getConnectedCalendarProvider(userId?: string): Promise<CalendarProvider> {
  const uid = userId || currentUserId;
  const [googleConnected, outlookConnected] = await Promise.all([
    isGoogleCalendarConnected(uid ?? undefined),
    isOutlookConnected(uid ?? undefined)
  ]);

  if (googleConnected) return 'google';
  if (outlookConnected) return 'outlook';
  return null;
}

/**
 * Check if any calendar is connected (backwards compatible)
 */
export async function isCalendarConnected(userId?: string): Promise<boolean> {
  const provider = await getConnectedCalendarProvider(userId);
  return provider !== null;
}

/**
 * Fetch Google calendar events around a given timestamp
 */
async function getGoogleEventsAroundTime(
  timestamp: Date,
  windowMinutes: number = 30,
  userId?: string
): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(userId);
    
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
    console.error('Failed to fetch Google calendar events:', error);
    return [];
  }
}

/**
 * Fetch calendar events around a given timestamp (uses connected provider)
 */
export async function getEventsAroundTime(
  timestamp: Date,
  windowMinutes: number = 30,
  userId?: string
): Promise<CalendarEvent[]> {
  const uid = userId || currentUserId;
  const provider = await getConnectedCalendarProvider(uid ?? undefined);
  
  if (provider === 'google') {
    return getGoogleEventsAroundTime(timestamp, windowMinutes, uid ?? undefined);
  } else if (provider === 'outlook') {
    return getOutlookEventsAroundTime(timestamp, windowMinutes, uid ?? undefined);
  }
  
  return [];
}

/**
 * Find the most relevant event for a given timestamp
 */
export async function findRelevantEvent(timestamp: Date, userId?: string): Promise<CalendarEvent | null> {
  const uid = userId || currentUserId;
  const provider = await getConnectedCalendarProvider(uid ?? undefined);
  
  if (provider === 'outlook') {
    return findOutlookRelevantEvent(timestamp, uid ?? undefined);
  }
  
  const events = await getGoogleEventsAroundTime(timestamp, 60, uid ?? undefined);
  
  if (events.length === 0) return null;
  
  const currentEvents = events.filter(event => 
    event.startTime <= timestamp && event.endTime >= timestamp
  );
  
  if (currentEvents.length > 0) {
    return currentEvents[0];
  }
  
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
    userId?: string;
  }
): Promise<CalendarEvent | null> {
  const uid = options?.userId || currentUserId;
  const provider = await getConnectedCalendarProvider(uid ?? undefined);
  const userTimezone = options?.timezone || 'UTC';

  if (!provider) {
    throw new Error('No calendar connected. Please connect Google Calendar or Outlook in Settings.');
  }
  
  if (provider === 'outlook') {
    return createOutlookCalendarEvent(title, startDateTime, endDateTime, { ...options, timezone: userTimezone, userId: uid ?? undefined });
  }
  
  return createGoogleCalendarEvent(title, startDateTime, endDateTime, { ...options, timezone: userTimezone, userId: uid ?? undefined });
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
    timezone?: string;
    userId?: string;
  }
): Promise<CalendarEvent | null> {
  try {
    const uid = options?.userId || currentUserId;
    const calendar = await getCalendarClient(uid ?? undefined);
    
    const userTimezone = options?.timezone || 'UTC';
    
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('[Calendar] Invalid date format:', { startDateTime, endDateTime });
      return null;
    }
    
    const formatLocalDateTime = (dateStr: string, date: Date, tz: string): string => {
      if (/[+-]\d{2}:\d{2}$/.test(dateStr)) {
        return dateStr;
      }
      if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        return dateStr;
      }
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(date);
      const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
      const hour = get('hour') === '24' ? '00' : get('hour');
      return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
    };

    const event: calendar_v3.Schema$Event = {
      summary: title,
      start: {
        dateTime: formatLocalDateTime(startDateTime, startDate, userTimezone),
        timeZone: userTimezone,
      },
      end: {
        dateTime: formatLocalDateTime(endDateTime, endDate, userTimezone),
        timeZone: userTimezone,
      },
    };

    if (options?.description) event.description = options.description;
    if (options?.location) event.location = options.location;
    if (options?.attendees && options.attendees.length > 0) {
      const validEmails = options.attendees.filter(a => a.includes('@'));
      if (validEmails.length > 0) {
        event.attendees = validEmails.map(email => ({ email }));
      }
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'none',
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
    const detail = error?.errors?.[0]?.message || error?.response?.data?.error?.message || error?.message || 'Unknown error';
    console.error('[Calendar] Failed to create event:', {
      message: error?.message,
      code: error?.code,
      errors: error?.errors,
      response: error?.response?.data,
    });
    throw new Error(`Google Calendar error: ${detail}`);
  }
}

/**
 * Check if a similar event already exists in the calendar
 */
export async function findDuplicateEvent(
  title: string,
  startDateTime: string,
  toleranceMinutes: number = 30,
  userId?: string
): Promise<CalendarEvent | null> {
  try {
    const uid = userId || currentUserId;
    const calendar = await getCalendarClient(uid ?? undefined);
    const startTime = new Date(startDateTime);
    
    const timeMin = new Date(startTime.getTime() - toleranceMinutes * 60 * 1000);
    const timeMax = new Date(startTime.getTime() + toleranceMinutes * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      maxResults: 20,
      q: title,
    });

    const events = response.data.items || [];
    
    const titleWords = title.toLowerCase().split(' ').filter(w => w.length > 2);
    
    for (const event of events) {
      const eventTitle = (event.summary || '').toLowerCase();
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
    console.error('Failed to check for duplicate event:', error);
    return null;
  }
}

/**
 * Get upcoming events for today (uses connected provider)
 */
export async function getTodaysEvents(userId?: string): Promise<CalendarEvent[]> {
  const uid = userId || currentUserId;
  const provider = await getConnectedCalendarProvider(uid ?? undefined);
  
  if (provider === 'outlook') {
    return getOutlookTodaysEvents(uid ?? undefined);
  }

  return getGoogleTodaysEvents(uid ?? undefined);
}

/**
 * Get today's Google calendar events
 */
async function getGoogleTodaysEvents(userId?: string): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(userId);
    
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
    console.error('Failed to fetch today\'s Google events:', error);
    return [];
  }
}

/**
 * Get upcoming calendar events for the next N days
 */
export async function getUpcomingEvents(days: number = 14, userId?: string): Promise<CalendarEvent[]> {
  const uid = userId || currentUserId;
  const provider = await getConnectedCalendarProvider(uid ?? undefined);
  
  if (provider === 'outlook') {
    return getOutlookUpcomingEvents(days, uid ?? undefined);
  }
  
  return getGoogleUpcomingEvents(days, uid ?? undefined);
}

async function getGoogleUpcomingEvents(days: number = 14, userId?: string): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(userId);
    
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
    console.error('Failed to fetch upcoming Google events:', error);
    return [];
  }
}

async function getOutlookUpcomingEvents(days: number = 14, userId?: string): Promise<CalendarEvent[]> {
  try {
    const connected = await isOutlookConnected(userId);
    if (!connected) return [];
    
    const now = new Date();
    const windowMinutes = days * 24 * 60;
    return getOutlookEventsAroundTime(now, windowMinutes, userId);
  } catch (error) {
    console.error('Failed to fetch upcoming Outlook events:', error);
    return [];
  }
}
