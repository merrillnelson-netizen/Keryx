import { Template } from "@shared/schema";

/**
 * Main voice command parser with comprehensive error handling
 * Routes commands to appropriate template-specific parsers
 * 
 * @param command - Raw voice command text
 * @param template - Active template defining parsing rules
 * @param type - Command type: "log" for data entry, "query" for data retrieval
 * @returns Parsed structured data object
 * @throws Error if parsing fails or command is invalid
 */
export function parseVoiceCommand(
  command: string, 
  template: Template, 
  type: "log" | "query"
): any {
  try {
    // Input validation
    if (!command || typeof command !== 'string') {
      throw new Error("Invalid command input: command must be a non-empty string");
    }
    
    if (!template || !template.name) {
      throw new Error("Invalid template: template must have a name");
    }
    
    if (type !== "log" && type !== "query") {
      throw new Error("Invalid command type: must be 'log' or 'query'");
    }

    // Clean the command by removing prefixes
    const cleanCommand = command.replace(/^(log|query)\s*/i, '').trim();
    
    if (cleanCommand.length === 0) {
      throw new Error("Empty command after cleaning - no content to parse");
    }
    
    console.log(`Parsing ${type} command for template "${template.name}":`, cleanCommand);
    
    // Route to template-specific parser
    if (template.name === "Billiards League") {
      return parseBilliardsCommand(cleanCommand, type);
    }
    
    // Fall back to generic parsing for other templates
    return parseGenericCommand(cleanCommand, template, type);
    
  } catch (error) {
    console.error("Voice command parsing failed:", error);
    throw error; // Re-throw for handling by caller
  }
}

/**
 * Parse billiards-specific voice commands with comprehensive error handling
 * Supports both logging game actions and querying historical data
 * 
 * Expected log format: "Round 1 Table 1 Game 1 - Louie Racked, Tom Broke"
 * Expected query format: "Who Racked on Round 1 Table 1 Game 1"
 * 
 * @param command - Cleaned voice command text
 * @param type - "log" for game actions, "query" for data retrieval
 * @returns Structured data object matching template schema
 * @throws Error if command format is invalid or required fields are missing
 */
function parseBilliardsCommand(command: string, type: "log" | "query"): any {
  try {
    if (type === "log") {
      // Parse logging command: "Round 1 Table 1 Game 1 - Louie Racked, Tom Broke"
      console.log("Parsing billiards log command:", command);
      
      // Extract round, table, and game numbers using regex
      const roundMatch = command.match(/round\s+(\d+)/i);
      const tableMatch = command.match(/table\s+(\d+)/i);
      const gameMatch = command.match(/game\s+(\d+)/i);
      
      // Convert matches to numbers with validation
      const round = roundMatch ? parseInt(roundMatch[1], 10) : null;
      const table = tableMatch ? parseInt(tableMatch[1], 10) : null;
      const game = gameMatch ? parseInt(gameMatch[1], 10) : null;
      
      // Validate required fields for logging
      if (round === null || round < 1) {
        throw new Error("Round number is required and must be a positive integer (e.g., 'Round 1')");
      }
      if (table === null || table < 1) {
        throw new Error("Table number is required and must be a positive integer (e.g., 'Table 1')");
      }
      if (game === null || game < 1) {
        throw new Error("Game number is required and must be a positive integer (e.g., 'Game 1')");
      }
      
      // Parse actions after the dash separator
      const dashIndex = command.indexOf('-');
      if (dashIndex === -1) {
        throw new Error("Action separator '-' not found. Format should be 'Round X Table Y Game Z - Player1 Action1, Player2 Action2'");
      }
      
      const actionsPart = command.substring(dashIndex + 1).trim();
      const actions: Array<{ player: string; action: string }> = [];
      
      if (!actionsPart) {
        throw new Error("No actions found after '-'. Please specify player actions like 'Mike racked, Sarah broke'");
      }
      
      // Split actions by comma and parse each action pair
      const actionPairs = actionsPart.split(',');
      for (const pair of actionPairs) {
        const trimmed = pair.trim();
        if (!trimmed) continue; // Skip empty entries
        
        const words = trimmed.split(/\s+/); // Split on any whitespace
        if (words.length < 2) {
          throw new Error(`Invalid action format: "${trimmed}". Each action should be "Player Action" (e.g., "Mike racked")`);
        }
        
        // Last word is the action, everything else is the player name
        const action = words[words.length - 1].toLowerCase();
        const player = words.slice(0, -1).join(' ');
        
        if (!player.trim()) {
          throw new Error(`Player name cannot be empty in action: "${trimmed}"`);
        }
        
        actions.push({ player: player.trim(), action: action.trim() });
      }
      
      if (actions.length === 0) {
        throw new Error("At least one player action is required (e.g., 'Mike racked, Sarah broke')");
      }
      
      console.log("Successfully parsed billiards log:", { round, table, game, actions });
      
      return {
        round,
        table,
        game,
        actions,
        type: 'billiards_log'
      };
      
    } else if (type === "query") {
      // Parse query command: "Who Racked on Round 1 Table 1 Game 1"
      console.log("Parsing billiards query command:", command);
      
      // Extract query action and game identifiers
      const actionMatch = command.match(/who\s+(\w+)/i);
      const roundMatch = command.match(/round\s+(\d+)/i);
      const tableMatch = command.match(/table\s+(\d+)/i);
      const gameMatch = command.match(/game\s+(\d+)/i);
      
      const action = actionMatch ? actionMatch[1].toLowerCase() : null;
      const round = roundMatch ? parseInt(roundMatch[1], 10) : null;
      const table = tableMatch ? parseInt(tableMatch[1], 10) : null;
      const game = gameMatch ? parseInt(gameMatch[1], 10) : null;
      
      // Validate query format
      if (!action) {
        throw new Error("Query action not found. Try asking 'Who racked?' or 'Who broke?'");
      }
      
      // At least one identifier should be specified for meaningful queries
      if (!round && !table && !game) {
        throw new Error("Please specify at least one identifier: Round, Table, or Game number");
      }
      
      console.log("Successfully parsed billiards query:", { action, round, table, game });
      
      return {
        queryType: 'who_did_action',
        action,
        round,
        table,
        game,
        type: 'billiards_query'
      };
    } else {
      throw new Error(`Unsupported billiards command type: ${type}`);
    }
    
  } catch (error) {
    console.error("Billiards command parsing failed:", error);
    throw error; // Re-throw for handling by caller
  }
}

/**
 * Generic parser for custom templates
 * Provides basic keyword-based parsing for non-billiards templates
 * Can be extended with more sophisticated NLP as needed
 * 
 * @param command - Cleaned voice command text
 * @param template - Template configuration for parsing
 * @param type - Command type for processing mode
 * @returns Basic structured data object
 */
function parseGenericCommand(command: string, template: Template, type: "log" | "query"): any {
  try {
    console.log(`Parsing generic ${type} command for template "${template.name}":`, command);
    
    // Basic keyword extraction and processing
    const words = command.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    
    if (words.length === 0) {
      throw new Error("No recognizable words found in command");
    }
    
    // For now, return a basic structure that can be extended
    // This could be enhanced with template-specific parsing rules
    const result = {
      originalCommand: command,
      keywords: words,
      template: template.name,
      type: type === "log" ? `${template.name.toLowerCase().replace(/\s+/g, '_')}_log` : `${template.name.toLowerCase().replace(/\s+/g, '_')}_query`,
      timestamp: new Date().toISOString(),
      // Placeholder for template-specific fields
      data: {
        raw_text: command,
        extracted_words: words
      }
    };
    
    console.log("Generic parsing result:", result);
    return result;
    
  } catch (error) {
    console.error("Generic command parsing failed:", error);
    throw new Error(`Failed to parse command for template "${template.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
