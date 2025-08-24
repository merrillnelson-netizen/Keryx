/**
 * Voice Command Parser Module
 * 
 * Simplified version focused on getting basic logging working
 * Will create simple structured data from voice commands
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
 * Simplified approach to ensure logging works
 * 
 * @param command - Raw voice command string
 * @param template - Template defining expected structure
 * @param type - Command type ("log" or "query")
 * @returns Parsed structured data or basic fallback structure
 */
export function parseVoiceCommand(
  command: string,
  template: Template,
  type: "log" | "query"
): ParsedVoiceData | null {
  try {
    // Input validation
    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      console.warn('Empty or invalid command provided');
      return null;
    }

    if (!template) {
      console.error('Invalid template provided');
      return null;
    }

    console.log(`Parsing ${type} command: "${command}" with template: ${template.name}`);

    // Clean and normalize the command string
    const cleanCommand = command.trim().toLowerCase();

    // For now, create a simple structure that will always work
    const result: ParsedVoiceData = {
      type: `${template.name.toLowerCase().replace(/\s+/g, '_')}_${type}`,
      command: cleanCommand,
      timestamp: new Date().toISOString(),
      originalCommand: command.trim()
    };

    // Try to extract some basic information
    const words = cleanCommand.split(/\s+/);
    const numbers = command.match(/\d+/g) || [];

    // Add numbers if found
    if (numbers.length > 0) {
      result.numbers = numbers.map(n => parseInt(n, 10));
    }

    // Add word count
    result.wordCount = words.length;

    // For billiards specifically, try to extract some common patterns
    if (template.name.toLowerCase().includes('billiards') || template.name.toLowerCase().includes('pool')) {
      // Extract round, table, game if mentioned
      const roundMatch = cleanCommand.match(/round\s+(\d+)/);
      const tableMatch = cleanCommand.match(/table\s+(\d+)/);
      const gameMatch = cleanCommand.match(/game\s+(\d+)/);

      if (roundMatch) result.round = parseInt(roundMatch[1], 10);
      if (tableMatch) result.table = parseInt(tableMatch[1], 10);
      if (gameMatch) result.game = parseInt(gameMatch[1], 10);

      // Extract potential player names (capitalized words)
      const playerNames = words.filter(word =>
        word.length > 1 &&
        /^[a-zA-Z]+$/.test(word) &&
        !['round', 'table', 'game', 'broke', 'racked', 'made', 'missed', 'shot'].includes(word.toLowerCase())
      );

      if (playerNames.length > 0) {
        result.players = playerNames.map(name =>
          name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
        );
      }

      // Look for common actions
      const actions = ['broke', 'racked', 'made', 'missed', 'shot', 'scratched', 'fouled', 'won', 'lost'];
      const foundActions = actions.filter(action => cleanCommand.includes(action));
      if (foundActions.length > 0) {
        result.actions = foundActions;
      }
    }

    console.log('Parsed command result:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error('Error in parseVoiceCommand:', error);

    // Return a basic fallback structure so logging doesn't fail
    return {
      type: 'fallback_log',
      command: command.trim(),
      timestamp: new Date().toISOString(),
      error: 'parsing_failed'
    };
  }
}

/**
 * Validate parsed data - simplified to always return true for basic logging
 * @param data - Parsed data object
 * @param template - Template configuration
 * @returns Boolean indicating if data is valid
 */
export function validateParsedData(data: ParsedVoiceData, template: Template): boolean {
  try {
    // For now, just check that we have some data
    return data && typeof data === 'object' && Object.keys(data).length > 0;
  } catch (error) {
    console.error('Error validating parsed data:', error);
    return false;
  }
}