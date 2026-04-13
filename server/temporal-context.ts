/**
 * Temporal context utilities for timezone-aware date/time formatting.
 *
 * All date/time values displayed to users or injected into AI prompts MUST
 * use the user's stored timezone (settings.userTimezone), never the server's
 * local timezone. Functions here centralise that logic so callers don't
 * accidentally fall back to `new Date().getFullYear()` / `toLocaleString()`
 * with no timezone argument.
 *
 * Default timezone: 'America/Denver' (Mountain Time — primary user).
 */

const DEFAULT_TZ = 'America/Denver';

/**
 * Return the full 4-digit year as seen by the user in their timezone.
 * Example: if it's 11 PM on Dec 31 UTC but Jan 1 in Denver, returns the new year.
 */
export function getYearInTimezone(tz: string = DEFAULT_TZ): number {
  return parseInt(
    new Date().toLocaleDateString('en-CA', { timeZone: tz, year: 'numeric' }),
    10
  );
}

/**
 * Return the full month name (e.g. "April") as seen by the user in their timezone.
 */
export function getMonthNameInTimezone(tz: string = DEFAULT_TZ): string {
  return new Date().toLocaleDateString('en-US', { timeZone: tz, month: 'long' });
}

/**
 * Format a specific Date object as a time string (e.g. "3:45 PM") in the user's timezone.
 */
export function formatTimeInTimezone(
  date: Date,
  tz: string = DEFAULT_TZ
): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Return a complete temporal snapshot for use in AI prompts or display strings.
 * Mirrors the context already built in generateMorningBriefing / detectCalendarEvent.
 */
export function buildTemporalContext(tz: string = DEFAULT_TZ): {
  year: number;
  month: string;
  localDate: string;
  localTime: string;
  dayOfWeek: string;
  timezone: string;
} {
  const now = new Date();
  return {
    year: getYearInTimezone(tz),
    month: getMonthNameInTimezone(tz),
    localDate: now.toLocaleDateString('en-CA', { timeZone: tz }), // YYYY-MM-DD
    localTime: now.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    dayOfWeek: now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }),
    timezone: tz,
  };
}
