/**
 * Temporal context utilities for timezone-aware date/time formatting.
 *
 * All date/time values injected into AI prompts or displayed to users MUST
 * use the user's stored timezone (settings.userTimezone), never the server's
 * local timezone. Functions here centralise that logic so callers never
 * accidentally fall back to raw `new Date()` with no timezone argument.
 *
 * Default timezone: 'America/Denver' (Mountain Time — primary user).
 */

const DEFAULT_TZ = 'America/Denver';

/**
 * Return the full 4-digit year as seen by the user in their timezone.
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
 * Compute the UTC offset string for a given timezone, e.g. "UTC-6" or "UTC+5:30".
 */
function getUtcOffsetString(tz: string): string {
  try {
    const now = new Date();
    const utcMs = now.getTime();
    // Get local time in that tz by parsing the locale string trick
    const localStr = now.toLocaleString('en-US', { timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // Build a Date from the local string (treated as UTC to get the raw offset)
    const [datePart, timePart] = localStr.split(', ');
    const [month, day, year] = datePart.split('/');
    const localMs = new Date(`${year}-${month}-${day}T${timePart}Z`).getTime();
    const offsetMinutes = Math.round((localMs - utcMs) / 60_000);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMinutes);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
  } catch {
    return 'UTC';
  }
}

/**
 * Return a complete temporal snapshot for injection into AI prompts.
 *
 * Includes:
 *   - Structured fields (year, month, localDate, localTime, dayOfWeek, timezone, utcOffset)
 *   - A ready-to-paste `criticalRules` string with the CRITICAL DATE RULES block
 *
 * Usage in a prompt:
 *   const temporal = buildTemporalContext(userTimezone);
 *   const prompt = `
 *     ${temporal.criticalRules}
 *     TODAY: ${temporal.localDate} (${temporal.dayOfWeek})
 *     TIME:  ${temporal.localTime}  ZONE: ${temporal.timezone} (${temporal.utcOffset})
 *   `;
 */
export function buildTemporalContext(tz: string = DEFAULT_TZ): {
  year: number;
  month: string;
  localDate: string;     // YYYY-MM-DD in user's timezone
  localTime: string;     // "h:mm AM/PM" in user's timezone
  dayOfWeek: string;     // e.g. "Monday"
  timezone: string;      // IANA tz string, e.g. "America/Denver"
  utcOffset: string;     // e.g. "UTC-6"
  criticalRules: string; // Ready-to-paste CRITICAL DATE RULES block for AI prompts
} {
  const now = new Date();
  const localDate = now.toLocaleDateString('en-CA', { timeZone: tz });
  const localTime = now.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dayOfWeek = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
  const year = getYearInTimezone(tz);
  const month = getMonthNameInTimezone(tz);
  const utcOffset = getUtcOffsetString(tz);

  const criticalRules = `CRITICAL DATE RULES:
- Today's date is ${localDate} (${dayOfWeek}), ${localTime} ${tz} (${utcOffset}).
- The current year is ${year}. The current month is ${month}.
- NEVER use 2023, 2024, or any year other than ${year} when constructing dates.
- All dates you generate must be on or after ${localDate}; do not produce past dates.
- When the user says "tomorrow", compute the day after ${localDate}.
- When the user says "next [weekday]", compute the next occurrence of that day after ${localDate}.
- Treat all relative time references ("in 30 minutes", "this afternoon") as relative to ${localTime} in ${tz}.`;

  return { year, month, localDate, localTime, dayOfWeek, timezone: tz, utcOffset, criticalRules };
}
