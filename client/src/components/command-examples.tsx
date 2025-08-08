import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Template } from "@shared/schema";

/**
 * Command Examples Component with Error Handling
 * Displays example voice commands based on the active template
 * Includes proper error handling for undefined template properties
 */
export default function CommandExamples() {
  const { data: activeTemplate } = useQuery<Template>({
    queryKey: ["/api/templates/active"],
  });

  /**
   * Generate example commands based on template with comprehensive error handling
   * @param template - Active template object (may be undefined during loading)
   * @returns Object containing example log and query commands
   */
  const getExampleCommands = (template?: Template) => {
    try {
      // Handle loading state when template is not yet available
      if (!template) {
        return {
          logCommands: [
            '"Hey M, Log example command"',
            '"Hey M, Log another example"'
          ],
          queryCommands: [
            '"Hey M, Query example search"',
            '"Hey M, Query another search"'
          ]
        };
      }

      // Handle Billiards League template with specific examples
      if (template.name === "Billiards League") {
        return {
          logCommands: [
            '"Hey M, Log Round 1 Table 1 Game 1 - Louie Racked, Tom Broke"',
            '"Hey M, Log Round 2 Table 3 Game 5 - Sarah Won"',
            '"Round 1 Table 2 Game 3 - Mike Racked, Sarah Broke"'
          ],
          queryCommands: [
            '"Hey M, Query Who Racked on Round 1 Table 1 Game 1"',
            '"Hey M, Query Who Won in Round 2"',
            '"Who Broke on Table 3?"'
          ]
        };
      }

      // Handle custom templates with proper error checking
      // Check if template has the required format properties
      const logFormat = template.logFormat || `[Template: ${template.name}] [Data]`;
      const queryFormat = template.queryFormat || `[Search: ${template.name}] [Query]`;
      
      return {
        logCommands: [
          `"Hey M, Log ${safePlaceholderReplace(logFormat, 'example')}"`,
          `"Hey M, Log ${safePlaceholderReplace(logFormat, 'sample data')}"`,
        ],
        queryCommands: [
          `"Hey M, Query ${safePlaceholderReplace(queryFormat, 'search term')}"`,
          `"Hey M, Query ${safePlaceholderReplace(queryFormat, 'find item')}"`,
        ]
      };
    } catch (error) {
      console.error("Error generating command examples:", error);
      // Return safe fallback examples if anything goes wrong
      return {
        logCommands: [
          '"Hey M, Log your data here"',
          '"Or use the Log Mode button below"'
        ],
        queryCommands: [
          '"Hey M, Query your question here"',
          '"Or use the Query Mode button below"'
        ]
      };
    }
  };

  /**
   * Safely replace placeholders in template strings
   * @param format - Template format string
   * @param replacement - Text to replace placeholders with
   * @returns Formatted string with placeholders replaced
   */
  const safePlaceholderReplace = (format: string, replacement: string): string => {
    try {
      if (!format || typeof format !== 'string') {
        return `${replacement} data`;
      }
      return format.replace(/\[.*?\]/g, replacement);
    } catch (error) {
      console.warn("Error in placeholder replacement:", error);
      return `${replacement} data`;
    }
  };

  // Get examples with error handling
  const examples = getExampleCommands(activeTemplate);

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6 mt-6">
      <CardContent>
        <h4 className="text-lg font-medium text-foreground mb-4">
          Example Commands
          {activeTemplate && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              for {activeTemplate.name}
            </span>
          )}
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Logging Commands Section */}
          <div>
            <h5 className="font-medium text-foreground mb-3 flex items-center">
              <span className="material-icons text-secondary mr-2">add_circle</span>
              Logging Commands
            </h5>
            <div className="space-y-2">
              {examples.logCommands.map((command, index) => (
                <div key={`log-${index}`} className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-mono text-green-800">{command}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Speak these commands or use the "Log Mode" button
            </p>
          </div>
          
          {/* Query Commands Section */}
          <div>
            <h5 className="font-medium text-foreground mb-3 flex items-center">
              <span className="material-icons text-accent mr-2">search</span>
              Query Commands
            </h5>
            <div className="space-y-2">
              {examples.queryCommands.map((command, index) => (
                <div key={`query-${index}`} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-sm font-mono text-orange-800">{command}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Speak these commands or use the "Query Mode" button
            </p>
          </div>
        </div>
        
        {/* Helpful tip */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Tip:</span> You can use voice commands with "Hey M" or click the Log/Query buttons for direct input.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
