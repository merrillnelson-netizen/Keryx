import { Template } from "@shared/schema";

export function parseVoiceCommand(
  command: string, 
  template: Template, 
  type: "log" | "query"
): any {
  // Remove the "log" or "query" prefix
  const cleanCommand = command.replace(/^(log|query)\s*/i, '').trim();
  
  if (template.name === "Billiards League") {
    return parseBilliardsCommand(cleanCommand, type);
  }
  
  // Generic parsing based on template format
  return parseGenericCommand(cleanCommand, template, type);
}

function parseBilliardsCommand(command: string, type: "log" | "query"): any {
  if (type === "log") {
    // Parse: "Round 1 Table 1 Game 1 - Louie Racked, Tom Broke"
    const roundMatch = command.match(/round\s+(\d+)/i);
    const tableMatch = command.match(/table\s+(\d+)/i);
    const gameMatch = command.match(/game\s+(\d+)/i);
    
    const round = roundMatch ? parseInt(roundMatch[1]) : null;
    const table = tableMatch ? parseInt(tableMatch[1]) : null;
    const game = gameMatch ? parseInt(gameMatch[1]) : null;
    
    // Parse actions after the dash
    const actionsPart = command.split('-')[1]?.trim();
    const actions: Array<{ player: string; action: string }> = [];
    
    if (actionsPart) {
      const actionPairs = actionsPart.split(',');
      for (const pair of actionPairs) {
        const trimmed = pair.trim();
        const words = trimmed.split(' ');
        if (words.length >= 2) {
          const player = words.slice(0, -1).join(' ');
          const action = words[words.length - 1];
          actions.push({ player, action });
        }
      }
    }
    
    return {
      round,
      table,
      game,
      actions,
      type: 'billiards_log'
    };
  } else {
    // Parse query: "Who Racked on Round 1 Table 1 Game 1"
    const actionMatch = command.match(/who\s+(\w+)/i);
    const roundMatch = command.match(/round\s+(\d+)/i);
    const tableMatch = command.match(/table\s+(\d+)/i);
    const gameMatch = command.match(/game\s+(\d+)/i);
    
    return {
      queryType: 'who_did_action',
      action: actionMatch ? actionMatch[1].toLowerCase() : null,
      round: roundMatch ? parseInt(roundMatch[1]) : null,
      table: tableMatch ? parseInt(tableMatch[1]) : null,
      game: gameMatch ? parseInt(gameMatch[1]) : null,
      type: 'billiards_query'
    };
  }
}

function parseGenericCommand(command: string, template: Template, type: "log" | "query"): any {
  // Basic parsing - could be enhanced with more sophisticated NLP
  const words = command.toLowerCase().split(' ');
  
  return {
    originalCommand: command,
    words,
    template: template.name,
    type: `${template.name.toLowerCase().replace(' ', '_')}_${type}`
  };
}
