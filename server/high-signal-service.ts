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

/**
 * Scan discoveries for mentions of high-priority people
 * Returns matches with context for alerts
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
    const searchText = `${discovery.title} ${discovery.content}`.toLowerCase();
    
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

      // Full name match (highest confidence)
      if (searchText.includes(personNameLower)) {
        matched = true;
        matchContext = `Full name "${person.name}" found in discovery`;
        confidence = 0.95;
      }
      // Multi-part name matching
      else if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];
        
        // Both first and last name appear (medium-high confidence)
        if (searchText.includes(firstName) && searchText.includes(lastName) && 
            firstName.length > 2 && lastName.length > 2) {
          matched = true;
          matchContext = `Both "${firstName}" and "${lastName}" found in discovery`;
          confidence = 0.75;
        }
        // Last name only (lower confidence, must be unique enough)
        else if (lastName.length >= 4 && searchText.includes(lastName)) {
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
 * Check if any high-signal matches warrant immediate notification
 * Priority 10 people always trigger, Priority 8-9 only for high confidence
 */
export function shouldTriggerAlert(matches: HighSignalMatch[]): HighSignalMatch[] {
  return matches.filter(match => {
    // Priority 10 (spouse, partner, close family) - always alert
    if (match.person.priority === 10) {
      return match.confidence >= 0.5;
    }
    // Priority 9 (close friend, business partner) - high confidence only
    if (match.person.priority === 9) {
      return match.confidence >= 0.75;
    }
    // Priority 8 - very high confidence only
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

/**
 * Get priority level description for UI display
 */
export function getPriorityDescription(priority: number): { label: string; description: string; color: string } {
  switch (priority) {
    case 10:
      return { label: 'VIP', description: 'Spouse, partner, immediate family', color: 'red' };
    case 9:
      return { label: 'Critical', description: 'Close family, business partners', color: 'orange' };
    case 8:
      return { label: 'High', description: 'Close friends, key colleagues', color: 'amber' };
    case 7:
      return { label: 'Important', description: 'Good friends, team members', color: 'yellow' };
    case 6:
      return { label: 'Moderate', description: 'Acquaintances, regular contacts', color: 'lime' };
    case 5:
      return { label: 'Standard', description: 'Default - occasional contacts', color: 'green' };
    case 4:
      return { label: 'Low', description: 'Infrequent contacts', color: 'teal' };
    case 3:
      return { label: 'Minimal', description: 'Rare contacts', color: 'cyan' };
    case 2:
      return { label: 'Background', description: 'Historical mentions', color: 'sky' };
    case 1:
      return { label: 'Archive', description: 'Archived/inactive', color: 'slate' };
    default:
      return { label: 'Unknown', description: 'Not set', color: 'gray' };
  }
}
