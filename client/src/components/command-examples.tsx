import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, Plus, Search } from "lucide-react";

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
    <div className="glass-card p-6 rounded-2xl border-white/20">
      <CardContent>
        <h4 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-accent" />
          Example Commands
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center">
                <Plus className="w-4 h-4 text-secondary" />
              </div>
              Logging Commands
            </h5>
            <div className="space-y-3">
              {examples.logCommands.map((command, index) => (
                <div key={`log-${index}`} className="glass-card p-4 rounded-xl border-secondary/30 hover:border-secondary/50 transition-all">
                  <p className="text-sm text-foreground/90">{command}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-start gap-2">
              <span className="mt-0.5">💡</span>
              <span>Speak naturally - AI will automatically extract topics and details</span>
            </p>
          </div>
          
          <div>
            <h5 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                <Search className="w-4 h-4 text-accent" />
              </div>
              Query Commands
            </h5>
            <div className="space-y-3">
              {examples.queryCommands.map((command, index) => (
                <div key={`query-${index}`} className="glass-card p-4 rounded-xl border-accent/30 hover:border-accent/50 transition-all">
                  <p className="text-sm text-foreground/90">{command}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-start gap-2">
              <span className="mt-0.5">💡</span>
              <span>Ask questions naturally - semantic search finds relevant memories</span>
            </p>
          </div>
        </div>
        
        <div className="mt-6 glass-card p-4 rounded-xl border-primary/30 bg-primary/5">
          <p className="text-sm text-foreground flex items-start gap-2">
            <span className="font-semibold text-primary">Tip:</span>
            <span>Press the Log or Query button, then speak naturally. The AI will understand the context and extract important details automatically.</span>
          </p>
        </div>
      </CardContent>
    </div>
  );
}
