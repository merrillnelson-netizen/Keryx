// TEMPORAL CONTEXT AUDIT: high-signal-service.ts contains no AI prompt calls.
// All logic here is pure regex/string matching against web discovery content.
// Date/time context is not emitted to any LLM. No buildTemporalContext injection
// required. If LLM summarisation of matches is added, adopt buildTemporalContext
// from './temporal-context' at that callsite.
import { storage } from "./storage";
import type { Person } from "@shared/schema";
import type { Discovery } from "./contextual-discoveries-service";

export interface HighSignalMatch {
  person: Person;
  discovery: Discovery;
  matchContext: string;
  confidence: number;
}

export interface HighSignalResult {
  matches: HighSignalMatch[];
  scannedDiscoveries: number;
  highPriorityPeopleChecked: number;
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Test whether a name token appears as a standalone word in text.
 * Word boundaries prevent substring matches (e.g. "Kim" won't match "Kimberly").
 * The negative lookahead (?!'s) prevents possessive matches.
 */
function nameTokenPresent(text: string, token: string): boolean {
  const escaped = escapeRegex(token);
  return new RegExp(`\\b${escaped}(?!'s)\\b`, 'i').test(text);
}

/**
 * Test whether a full multi-word name appears as a contiguous phrase in text,
 * with word boundaries around the whole phrase and no possessive suffix.
 */
function fullNamePhrasePresent(text: string, nameLower: string): boolean {
  const escaped = escapeRegex(nameLower);
  const pattern = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${pattern}(?!'s)\\b`, 'i').test(text);
}

/**
 * Scan discoveries for mentions of high-priority people.
 *
 * MATCHING POLICY (changed to eliminate single-name false positives):
 * - People stored with only ONE name part produce NO match. A first name alone
 *   appearing in a web article is not evidence the user's contact is mentioned.
 * - For multi-word names ONLY:
 *   a) Full-phrase match (e.g. "Kim Johnson" as a contiguous phrase) → confidence 0.95
 *   b) Both first AND last name appearing independently → confidence 0.75
 *   c) Last-name-only → NO match (removed; too many false positives with common surnames)
 *
 * Uses word-boundary regex to avoid substring and possessive false positives.
 */
export async function detectHighSignalMentions(
  userId: string,
  discoveries: Discovery[],
  minPriority: number = 8
): Promise<HighSignalResult> {
  if (!discoveries || discoveries.length === 0) {
    return { matches: [], scannedDiscoveries: 0, highPriorityPeopleChecked: 0 };
  }

  const highPriorityPeople = await storage.getHighPriorityPeople(userId, minPriority);
  
  if (highPriorityPeople.length === 0) {
    return { matches: [], scannedDiscoveries: discoveries.length, highPriorityPeopleChecked: 0 };
  }

  const matches: HighSignalMatch[] = [];

  for (const discovery of discoveries) {
    const searchText = `${discovery.title} ${discovery.content}`;
    
    for (const person of highPriorityPeople) {
      const personName = person.name?.trim();

      // Skip invalid or empty names
      if (!personName || personName.length < 2) {
        continue;
      }

      const personNameLower = personName.toLowerCase();
      const nameParts = personNameLower.split(/\s+/);

      // POLICY: single-word names (first name only) produce NO match.
      // A lone "Kim" or "Michael" in a web article could refer to anyone.
      if (nameParts.length < 2) {
        continue;
      }

      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];

      let matched = false;
      let matchContext = '';
      let confidence = 0;

      // a) Full name as a contiguous phrase (highest confidence)
      if (fullNamePhrasePresent(searchText, personNameLower)) {
        matched = true;
        matchContext = `Full name "${personName}" found in discovery`;
        confidence = 0.95;
      }
      // b) Both first AND last name appear as standalone words (medium-high confidence)
      //    Require both parts to be longer than 2 chars to filter out initials
      else if (
        firstName.length > 2 &&
        lastName.length > 2 &&
        nameTokenPresent(searchText, firstName) &&
        nameTokenPresent(searchText, lastName)
      ) {
        matched = true;
        matchContext = `Both "${firstName}" and "${lastName}" found in discovery`;
        confidence = 0.75;
      }
      // (No last-name-only path — too many false positives with common surnames)

      if (matched) {
        // Boost confidence slightly for priority 10 people (spouse/partner/close family)
        if (person.priority === 10) {
          confidence = Math.min(1, confidence + 0.05);
        }

        matches.push({
          person,
          discovery,
          matchContext,
          confidence
        });
      }
    }
  }

  // Sort by confidence (highest first) then by person priority
  matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.person.priority - a.person.priority;
  });

  return {
    matches,
    scannedDiscoveries: discoveries.length,
    highPriorityPeopleChecked: highPriorityPeople.length
  };
}

/**
 * Check if any high-signal matches warrant immediate notification.
 *
 * Since we now require full-name matches (both first+last), thresholds
 * are straightforward — no special short-name cases needed:
 * - Priority 10 (spouse/partner/close family): alert on any match ≥ 0.75
 * - Priority 9 (close friend/business partner): alert on high confidence ≥ 0.85
 * - Priority 8: alert only on full-phrase match ≥ 0.92
 */
export function shouldTriggerAlert(matches: HighSignalMatch[]): HighSignalMatch[] {
  return matches.filter(match => {
    if (match.person.priority === 10) {
      return match.confidence >= 0.75;
    }
    if (match.person.priority === 9) {
      return match.confidence >= 0.85;
    }
    // Priority 8 — require near-certain full-phrase match
    return match.confidence >= 0.92;
  });
}

/**
 * Format alert message for push notification
 */
export function formatHighSignalAlert(match: HighSignalMatch): {
  title: string;
  body: string;
  url?: string;
} {
  const priorityLabel = match.person.priority === 10 ? 'VIP' : 'Important';
  const relationshipNote = match.person.relationship 
    ? ` (${match.person.relationship})` 
    : '';

  return {
    title: `${priorityLabel} Person Alert: ${match.person.name}`,
    body: `${match.person.name}${relationshipNote} may be mentioned in: "${match.discovery.title.slice(0, 60)}..."`,
    url: match.discovery.url
  };
}

// Re-export from shared utilities for backward compatibility
export { 
  getPriorityInfo, 
  getPriorityLabel, 
  getPriorityDisplayInfo,
  HIGH_SIGNAL_MIN_PRIORITY 
} from "@shared/priority-utils";
