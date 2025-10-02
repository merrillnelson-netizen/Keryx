import { Card, CardContent } from "@/components/ui/card";

export default function CommandExamples() {
  const examples = {
    logCommands: [
      '"We had our billiards match tonight. Mark broke on table 2, round 3, game 1"',
      '"Went to the grocery store. Bought milk, eggs, and bread for 25 dollars"',
      '"Just finished our team meeting. We discussed the new project launch and Sarah volunteered to lead it"'
    ],
    queryCommands: [
      '"Who broke for the first game on table 2?"',
      '"What did I buy at the store this week?"',
      '"Who volunteered to lead the project?"'
    ]
  };

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6 mt-6">
      <CardContent>
        <h4 className="text-lg font-medium text-foreground mb-4">
          Example Commands
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              Speak naturally - AI will automatically extract topics and details
            </p>
          </div>
          
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
              Ask questions naturally - semantic search finds relevant memories
            </p>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Tip:</span> Press the Log or Query button, then speak naturally. The AI will understand the context and extract important details automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
