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
function escapeRegexChars(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Test whether a name token appears as a standalone word in text.
 * Word boundaries prevent substring matches (e.g. "Kim" won't match "Kimberly").
 * The negative lookahead (?!'s) prevents possessive matches (e.g. "Kim" won't match "Kim's").
 */
function nameTokenPresent(text: string, token: string): boolean {
  const escaped = escapeRegexChars(token);
  return new RegExp(`\\b${escaped}(?!'s)\\b`, 'i').test(text);
}

/**
 * Test whether a full multi-word name appears as a contiguous phrase in text,
 * with word boundaries around the whole phrase and no possessive suffix.
 */
function fullNamePhrasePresent(text: string, nameLower: string): boolean {
  const escaped = escapeRegexChars(nameLower);
  const pattern = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${pattern}(?!'s)\\b`, 'i').test(text);
}

/** True if the person has a single-word name shorter than 5 characters (e.g. "Kim", "Ben", "Lee") */
function isShortSingleName(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 && name.trim().length < 5;
}

/**
 * Scan discoveries for mentions of high-priority people.
 * Uses word-boundary regex matching to avoid false positives from substrings and possessives.
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
      const personNameLower = person.name.toLowerCase();
      const nameParts = personNameLower.split(' ');
      
      let matched = false;
      let matchContext = '';
      let confidence = 0;

      // Skip invalid names (empty or too short)
      if (!person.name || person.name.trim().length < 2) {
        continue;
      }

      // Full name phrase match (highest confidence) — word-bounded, no possessives
      if (fullNamePhrasePresent(searchText, personNameLower)) {
        matched = true;
        matchContext = `Full name "${person.name}" found in discovery`;
        // Short single-word names (like "Kim") are less unique; apply slight confidence reduction
        confidence = isShortSingleName(person.name) ? 0.80 : 0.95;
      }
      // Multi-part name matching
      else if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];
        
        // Both first and last name appear as standalone words (medium-high confidence)
        if (nameTokenPresent(searchText, firstName) && nameTokenPresent(searchText, lastName) && 
            firstName.length > 2 && lastName.length > 2) {
          matched = true;
          matchContext = `Both "${firstName}" and "${lastName}" found in discovery`;
          confidence = 0.75;
        }
        // Last name only (lower confidence, must be unique enough)
        else if (lastName.length >= 4 && nameTokenPresent(searchText, lastName)) {
          matched = true;
          matchContext = `Last name "${lastName}" found - verify manually`;
          confidence = 0.5;
        }
      }

      if (matched && confidence >= 0.5) {
        // Boost confidence for priority 10 people
        if (person.priority === 10) {
          confidence = Math.min(1, confidence + 0.1);
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
 * Priority 10 people always trigger, Priority 8-9 only for high confidence.
 * Short single-word names (< 5 chars, e.g. "Kim") require higher confidence
 * to reduce false positives from business names and coincidental word matches.
 */
export function shouldTriggerAlert(matches: HighSignalMatch[]): HighSignalMatch[] {
  return matches.filter(match => {
    const shortName = isShortSingleName(match.person.name);

    // Priority 10 (spouse, partner, close family) — always alert
    // Short names require 0.85 to filter out business-name false positives
    if (match.person.priority === 10) {
      return match.confidence >= (shortName ? 0.85 : 0.5);
    }
    // Priority 9 (close friend, business partner) — high confidence only
    if (match.person.priority === 9) {
      return match.confidence >= (shortName ? 0.92 : 0.75);
    }
    // Priority 8 — very high confidence only
    return match.confidence >= 0.9;
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
