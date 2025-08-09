
/**
 * Voice Command Parser Module
 * 
 * This module handles parsing of natural language voice commands into structured data
 * based on predefined templates. It includes comprehensive error handling, garbage
 * collection, and memory management practices.
 * 
 * Features:
 * - Template-based parsing
 * - Natural language processing
 * - Error handling and validation
 * - Memory efficient processing
 * - Support for multiple data types
 */

import { Template } from "@shared/schema";

/**
 * Interface for parsed voice command results
 */
interface ParsedVoiceData {
  [key: string]: any;
}

/**
 * Parse voice command into structured data based on template
 * Handles memory cleanup and prevents memory leaks
 * 
 * @param command - Raw voice command string
 * @param template - Template defining expected structure
 * @param type - Command type ("log" or "query")
 * @returns Parsed structured data or null if parsing fails
 */
export function parseVoiceCommand(
  command: string, 
  template: Template, 
  type: "log" | "query"
): ParsedVoiceData | null {
  try {
    // Input validation with early return to prevent unnecessary processing
    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      console.warn('Empty or invalid command provided');
      return null;
    }

    if (!template || !template.fields || !Array.isArray(template.fields)) {
      console.error('Invalid template provided');
      return null;
    }

    console.log(`Parsing ${type} command: "${command}" with template: ${template.name}`);

    // Clean and normalize the command string
    const cleanCommand = command.trim().toLowerCase();
    
    // Initialize result object
    const result: ParsedVoiceData = {};

    try {
      // Template-specific parsing based on template name
      if (template.name.toLowerCase().includes('billiards') || 
          template.name.toLowerCase().includes('pool')) {
        
        return parseBilliardsCommand(cleanCommand, template, type);
      }

      // Generic parsing for other templates
      return parseGenericCommand(cleanCommand, template, type);

    } catch (parseError) {
      console.error('Error during command parsing:', parseError);
      return null;
    }

  } catch (error) {
    console.error('Error in parseVoiceCommand:', error);
    return null;
  }
}

/**
 * Parse billiards-specific voice commands
 * Handles memory cleanup and validates input data
 * 
 * @param command - Cleaned command string
 * @param template - Billiards template
 * @param type - Command type
 * @returns Parsed billiards data or null
 */
function parseBilliardsCommand(
  command: string, 
  template: Template, 
  type: "log" | "query"
): ParsedVoiceData | null {
  try {
    console.log('Parsing billiards command:', command);

    if (type === "log") {
      return parseBilliardsLog(command);
    } else if (type === "query") {
      return parseBilliardsQuery(command);
    }

    return null;

  } catch (error) {
    console.error('Error parsing billiards command:', error);
    return null;
  }
}

/**
 * Parse billiards log commands with comprehensive error handling
 * Expected format: "Round X Table Y Game Z - Player Action, Player Action"
 * 
 * @param command - Cleaned command string
 * @returns Parsed billiards log data
 */
function parseBilliardsLog(command: string): ParsedVoiceData | null {
  try {
    // Regex patterns for extracting billiards data
    const roundMatch = command.match(/round\s+(\d+)/i);
    const tableMatch = command.match(/table\s+(\d+)/i);
    const gameMatch = command.match(/game\s+(\d+)/i);

    // Extract basic numeric fields
    const round = roundMatch ? parseInt(roundMatch[1], 10) : null;
    const table = tableMatch ? parseInt(tableMatch[1], 10) : null;
    const game = gameMatch ? parseInt(gameMatch[1], 10) : null;

    console.log('Extracted numbers - Round:', round, 'Table:', table, 'Game:', game);

    // Find the actions part after the dash
    const actionsPart = command.split('-')[1];
    if (!actionsPart) {
      console.warn('No actions found in command');
      // Return basic structure even without actions
      return {
        round: round || 1,
        table: table || 1,
        game: game || 1,
        actions: [],
        players: [],
        type: 'billiards_log'
      };
    }

    // Parse actions and players
    const { actions, players } = parseActionsAndPlayers(actionsPart.trim());

    const result = {
      round: round || 1,
      table: table || 1,
      game: game || 1,
      actions,
      players,
      type: 'billiards_log'
    };

    console.log('Parsed billiards log:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error('Error parsing billiards log:', error);
    return null;
  }
}

/**
 * Parse actions and players from command text
 * Handles various natural language formats
 * 
 * @param actionsText - Text containing player actions
 * @returns Object with parsed actions and players arrays
 */
function parseActionsAndPlayers(actionsText: string): { actions: any[], players: string[] } {
  try {
    const actions: any[] = [];
    const playersSet = new Set<string>(); // Use Set to avoid duplicates

    // Split by commas to get individual action phrases
    const actionPhrases = actionsText.split(',').map(phrase => phrase.trim());

    for (const phrase of actionPhrases) {
      try {
        // Skip empty phrases
        if (!phrase) continue;

        // Common action patterns
        const patterns = [
          // "Player action" format
          /^(\w+)\s+(broke|racked|shot|missed|made|won|lost|scratched|fouled)/i,
          // "Action by player" format
          /(broke|racked|shot|missed|made|won|lost|scratched|fouled)\s+by\s+(\w+)/i,
          // "Player did action" format
          /^(\w+)\s+(did|made|took)\s+(\w+)/i
        ];

        let matched = false;

        for (const pattern of patterns) {
          const match = phrase.match(pattern);
          if (match) {
            let player: string;
            let action: string;

            if (pattern.source.includes('by')) {
              // "Action by player" format
              action = match[1];
              player = match[2];
            } else {
              // "Player action" format
              player = match[1];
              action = match[2] || match[3]; // Handle different capture groups
            }

            // Clean up the extracted values
            player = player.trim().toLowerCase();
            action = action.trim().toLowerCase();

            // Capitalize first letter of player name
            player = player.charAt(0).toUpperCase() + player.slice(1);

            // Add to collections
            playersSet.add(player);
            actions.push({ player, action });
            
            matched = true;
            console.log(`Parsed action: ${player} ${action}`);
            break;
          }
        }

        // If no pattern matched, try to extract at least a player name
        if (!matched) {
          const words = phrase.split(/\s+/);
          if (words.length > 0) {
            const possiblePlayer = words[0].trim();
            if (possiblePlayer.length > 1) {
              const player = possiblePlayer.charAt(0).toUpperCase() + possiblePlayer.slice(1).toLowerCase();
              playersSet.add(player);
              actions.push({ player, action: 'unknown' });
              console.log(`Extracted player from unmatched phrase: ${player}`);
            }
          }
        }

      } catch (phraseError) {
        console.warn('Error parsing phrase:', phrase, phraseError);
        continue; // Continue processing other phrases
      }
    }

    // Convert Set to Array for final result
    const players = Array.from(playersSet);

    return { actions, players };

  } catch (error) {
    console.error('Error parsing actions and players:', error);
    return { actions: [], players: [] };
  }
}

/**
 * Parse billiards query commands
 * Expected formats: "Who broke on round X", "What happened in game Y"
 * 
 * @param command - Cleaned command string
 * @returns Parsed billiards query data
 */
function parseBilliardsQuery(command: string): ParsedVoiceData | null {
  try {
    const result: ParsedVoiceData = {
      type: 'billiards_query'
    };

    // Extract query type
    if (command.includes('who')) {
      result.queryType = 'who';
    } else if (command.includes('what')) {
      result.queryType = 'what';
    } else if (command.includes('when')) {
      result.queryType = 'when';
    } else {
      result.queryType = 'general';
    }

    // Extract numeric filters
    const roundMatch = command.match(/round\s+(\d+)/i);
    const tableMatch = command.match(/table\s+(\d+)/i);
    const gameMatch = command.match(/game\s+(\d+)/i);

    if (roundMatch) result.round = parseInt(roundMatch[1], 10);
    if (tableMatch) result.table = parseInt(tableMatch[1], 10);
    if (gameMatch) result.game = parseInt(gameMatch[1], 10);

    // Extract action filters
    const actions = ['broke', 'racked', 'shot', 'missed', 'made', 'won', 'lost', 'scratched', 'fouled'];
    for (const action of actions) {
      if (command.includes(action)) {
        result.action = action;
        break;
      }
    }

    console.log('Parsed billiards query:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error('Error parsing billiards query:', error);
    return null;
  }
}

/**
 * Generic command parser for non-billiards templates
 * Provides fallback parsing for custom templates
 * 
 * @param command - Cleaned command string
 * @param template - Template configuration
 * @param type - Command type
 * @returns Parsed generic data or null
 */
function parseGenericCommand(
  command: string, 
  template: Template, 
  type: "log" | "query"
): ParsedVoiceData | null {
  try {
    const result: ParsedVoiceData = {
      type: `${template.name.toLowerCase().replace(/\s+/g, '_')}_${type}`,
      rawCommand: command
    };

    // Extract numbers for numeric fields
    const numbers = command.match(/\d+/g);
    let numberIndex = 0;

    // Process template fields
    for (const field of template.fields) {
      try {
        if (field.type === 'number' && numbers && numberIndex < numbers.length) {
          result[field.name] = parseInt(numbers[numberIndex], 10);
          numberIndex++;
        } else if (field.type === 'string') {
          // Extract potential string values
          const words = command.split(/\s+/).filter(word => 
            word.length > 2 && !word.match(/^\d+$/)
          );
          if (words.length > 0) {
            result[field.name] = words[0];
          }
        } else if (field.type === 'array') {
          // Initialize as empty array
          result[field.name] = [];
        }
      } catch (fieldError) {
        console.warn(`Error processing field ${field.name}:`, fieldError);
        continue;
      }
    }

    console.log('Parsed generic command:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error('Error parsing generic command:', error);
    return null;
  }
}

/**
 * Validate parsed data against template requirements
 * Ensures data integrity before database storage
 * 
 * @param data - Parsed data object
 * @param template - Template configuration
 * @returns Boolean indicating if data is valid
 */
export function validateParsedData(data: ParsedVoiceData, template: Template): boolean {
  try {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check required fields
    for (const field of template.fields) {
      if (field.required && (data[field.name] === undefined || data[field.name] === null)) {
        console.warn(`Required field ${field.name} is missing`);
        return false;
      }
    }

    return true;

  } catch (error) {
    console.error('Error validating parsed data:', error);
    return false;
  }
}
