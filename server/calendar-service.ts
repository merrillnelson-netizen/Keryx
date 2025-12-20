/**
 * Calendar Service for Google Calendar Integration
 * Fetches events around a given timestamp to enrich meeting memories
 * 
 * Integration: google-calendar connector via Replit
 */

import { google, calendar_v3 } from 'googleapis';

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings?.expires_at && 
      new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
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
  connectionSettings = data.items?.[0];

  const accessToken = connectionSettings?.settings?.access_token || 
                      connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
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
export async function isCalendarConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch calendar events around a given timestamp
 * Returns events that overlap with the time window (±30 minutes by default)
 */
export async function getEventsAroundTime(
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
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}

/**
 * Find the most relevant event for a given timestamp
 * Prioritizes events that are currently happening
 */
export async function findRelevantEvent(timestamp: Date): Promise<CalendarEvent | null> {
  const events = await getEventsAroundTime(timestamp, 60);
  
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
 * Create a new calendar event
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
  try {
    const calendar = await getCalendarClient();
    
    const event: calendar_v3.Schema$Event = {
      summary: title,
      start: {
        dateTime: startDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime,
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
  } catch (error) {
    console.error('Failed to create calendar event:', error);
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
 * Get upcoming events for today
 */
export async function getTodaysEvents(): Promise<CalendarEvent[]> {
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
    console.error('Failed to fetch today\'s events:', error);
    return [];
  }
}
