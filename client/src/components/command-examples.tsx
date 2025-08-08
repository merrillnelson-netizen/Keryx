import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Template } from "@shared/schema";

export default function CommandExamples() {
  const { data: activeTemplate } = useQuery<Template>({
    queryKey: ["/api/templates/active"],
  });

  const getExampleCommands = (template?: Template) => {
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

    // Generate examples based on template
    if (template.name === "Billiards League") {
      return {
        logCommands: [
          '"Hey M, Log Round 1 Table 1 Game 1 - Louie Racked, Tom Broke"',
          '"Hey M, Log Round 2 Table 3 Game 5 - Sarah Won"'
        ],
        queryCommands: [
          '"Hey M, Query Who Racked on Round 1 Table 1 Game 1"',
          '"Hey M, Query Who Won in Round 2"'
        ]
      };
    }

    return {
      logCommands: [
        `"Hey M, Log ${template.logFormat.replace(/\[.*?\]/g, 'example')}"`,
        `"Hey M, Log ${template.logFormat.replace(/\[.*?\]/g, 'another')}"`,
      ],
      queryCommands: [
        `"Hey M, Query ${template.queryFormat.replace(/\[.*?\]/g, 'example')}"`,
        `"Hey M, Query ${template.queryFormat.replace(/\[.*?\]/g, 'another')}"`,
      ]
    };
  };

  const examples = getExampleCommands(activeTemplate);

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6 mt-6">
      <CardContent>
        <h4 className="text-lg font-medium text-foreground mb-4">Example Commands</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-foreground mb-3 flex items-center">
              <span className="material-icons text-secondary mr-2">add_circle</span>
              Logging Commands
            </h5>
            <div className="space-y-2">
              {examples.logCommands.map((command, index) => (
                <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-mono text-green-800">{command}</p>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h5 className="font-medium text-foreground mb-3 flex items-center">
              <span className="material-icons text-accent mr-2">search</span>
              Query Commands
            </h5>
            <div className="space-y-2">
              {examples.queryCommands.map((command, index) => (
                <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-sm font-mono text-orange-800">{command}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
