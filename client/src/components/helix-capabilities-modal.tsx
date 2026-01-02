import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Calendar, 
  Mail, 
  MessageSquare, 
  Brain, 
  Zap,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CapabilityExample {
  phrase: string;
  description: string;
}

interface CapabilityCategory {
  id: string;
  name: string;
  icon: typeof Calendar;
  color: string;
  description: string;
  examples: CapabilityExample[];
}

const capabilities: CapabilityCategory[] = [
  {
    id: "calendar",
    name: "Calendar",
    icon: Calendar,
    color: "text-blue-500",
    description: "Schedule events, set reminders, and manage your time",
    examples: [
      { phrase: "Schedule a meeting with Sarah tomorrow at 2pm", description: "Creates a calendar event with the specified time and attendee" },
      { phrase: "Remind me to call the dentist next Monday at 9am", description: "Sets up a reminder event on your calendar" },
      { phrase: "Block off Friday afternoon for focused work", description: "Creates a time block to protect your schedule" },
      { phrase: "Set up a weekly team standup every Tuesday at 10am", description: "Creates a recurring calendar event" },
      { phrase: "Move my 3pm meeting to 4pm", description: "Reschedules an existing calendar event" },
    ]
  },
  {
    id: "email",
    name: "Email",
    icon: Mail,
    color: "text-green-500",
    description: "Send emails via Gmail, read and summarize via Outlook",
    examples: [
      { phrase: "Summarize my unread emails from today", description: "Gives you a quick overview of what's in your Outlook inbox" },
      { phrase: "Any important emails I should know about?", description: "Highlights priority messages that need attention (via Outlook)" },
      { phrase: "Send an email to John about the meeting", description: "Composes and sends an email via Gmail or Outlook" },
      { phrase: "Draft a reply to the project proposal email", description: "Helps compose a response to a specific message" },
      { phrase: "What emails did I get this week?", description: "Summarizes recent emails from your Outlook inbox" },
    ]
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: MessageSquare,
    color: "text-purple-500",
    description: "Record memories on-the-go and receive proactive notifications",
    examples: [
      { phrase: "Send voice notes to Helix via Telegram", description: "Record memories hands-free from your phone" },
      { phrase: "Get morning briefings via Telegram", description: "Receive your daily summary as a message" },
      { phrase: "Quick text notes while commuting", description: "Log thoughts without opening the app" },
      { phrase: "Receive pattern alerts on Telegram", description: "Get notified about important trends in your data" },
    ]
  },
  {
    id: "memory",
    name: "Memory & Search",
    icon: Brain,
    color: "text-amber-500",
    description: "Log experiences and search through your personal knowledge base",
    examples: [
      { phrase: "Remember that I met Jake at the coffee shop downtown", description: "Logs a memory with people and location context" },
      { phrase: "What was I working on last Tuesday?", description: "Searches your memories by date" },
      { phrase: "When did I last talk to Mom about the vacation?", description: "Finds memories involving specific people and topics" },
      { phrase: "Show me memories about the product launch", description: "Searches by topic or project" },
      { phrase: "How was I feeling last week?", description: "Reviews your mood patterns over time" },
      { phrase: "What decisions did I make about the budget?", description: "Recalls past thoughts and conclusions" },
    ]
  },
  {
    id: "power",
    name: "Power Tasks",
    icon: Zap,
    color: "text-rose-500",
    description: "Advanced cross-integration capabilities for power users",
    examples: [
      { phrase: "Summarize my calendar and emails for the week", description: "Cross-integration overview of your schedule and messages" },
      { phrase: "After my meeting with Lisa, remind me to send the proposal", description: "Intelligent follow-up scheduling based on events" },
      { phrase: "Track my energy levels after each meeting today", description: "Automatic memory prompts tied to calendar events" },
      { phrase: "Send me a Telegram summary of tomorrow's schedule", description: "Proactive calendar digest via messaging" },
      { phrase: "Find all memories about the client and draft a prep email", description: "Research and compose in one command" },
      { phrase: "Block focus time whenever I have 3+ meetings in a day", description: "Smart calendar protection rules" },
    ]
  }
];

const hintExamples = [
  "Schedule a meeting with Sarah tomorrow at 2pm",
  "What was I thinking about last week?",
  "Remind me to call the dentist Monday at 9am",
  "Summarize my unread emails",
  "Remember I met Jake at the coffee shop",
  "Send an email to John about the project",
  "How was I feeling yesterday?",
  "Block Friday afternoon for focused work",
  "What did Mom say about the vacation?",
  "Any important emails I should check?",
];

export function useRotatingHints() {
  const [currentHint, setCurrentHint] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHint(prev => (prev + 1) % hintExamples.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return hintExamples[currentHint];
}

export function HintChips() {
  const [visibleHints, setVisibleHints] = useState<number[]>([0, 1, 2]);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setVisibleHints(prev => {
          const nextStart = (prev[0] + 3) % hintExamples.length;
          return [
            nextStart,
            (nextStart + 1) % hintExamples.length,
            (nextStart + 2) % hintExamples.length
          ];
        });
        setIsAnimating(false);
      }, 300);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-wrap justify-center gap-2 mt-4">
      {visibleHints.map((hintIndex, i) => (
        <Badge
          key={`${hintIndex}-${i}`}
          variant="outline"
          className={cn(
            "px-3 py-1.5 text-xs bg-white/5 border-white/20 text-muted-foreground cursor-default transition-all duration-300",
            isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"
          )}
        >
          <Sparkles className="w-3 h-3 mr-1.5 text-primary/60" />
          "{hintExamples[hintIndex]}"
        </Badge>
      ))}
    </div>
  );
}

export function HelixCapabilitiesModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 justify-start text-foreground bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/30 hover:from-primary/20 hover:to-secondary/20 hover:border-primary/50"
          data-testid="button-help-capabilities"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          <span>What can Helix do?</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[85vh] sm:h-auto sm:max-h-[85vh] glass-card-strong border-white/20 p-0 flex flex-col">
        <DialogHeader className="p-4 sm:p-6 pb-0 shrink-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            What Helix Can Do For You
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2 text-sm">
            Explore all the ways Helix can help manage your memories, calendar, email, and more
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="calendar" className="flex flex-col flex-1 min-h-0">
          <div className="px-4 sm:px-6 pt-4 shrink-0">
            <TabsList className="w-full grid grid-cols-5 bg-white/5 p-1 rounded-xl">
              {capabilities.map(cat => {
                const Icon = cat.icon;
                return (
                  <TabsTrigger
                    key={cat.id}
                    value={cat.id}
                    className="flex items-center gap-1.5 text-xs sm:text-sm data-[state=active]:bg-white/10 px-1 sm:px-3"
                    data-testid={`tab-capability-${cat.id}`}
                  >
                    <Icon className={cn("w-4 h-4", cat.color)} />
                    <span className="hidden sm:inline">{cat.name}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0 px-4 sm:px-6 pb-4 sm:pb-6">
            {capabilities.map(cat => {
              const Icon = cat.icon;
              return (
                <TabsContent key={cat.id} value={cat.id} className="mt-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", 
                      cat.id === "calendar" && "bg-blue-500/20",
                      cat.id === "email" && "bg-green-500/20",
                      cat.id === "telegram" && "bg-purple-500/20",
                      cat.id === "memory" && "bg-amber-500/20",
                      cat.id === "power" && "bg-rose-500/20"
                    )}>
                      <Icon className={cn("w-6 h-6", cat.color)} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{cat.name}</h3>
                      <p className="text-sm text-muted-foreground">{cat.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      Try saying...
                    </h4>
                    <div className="grid gap-3">
                      {cat.examples.map((example, i) => (
                        <div 
                          key={i} 
                          className="glass-card p-4 rounded-xl border border-white/10 hover:border-primary/30 transition-colors"
                        >
                          <p className="text-foreground font-medium mb-1">
                            "{example.phrase}"
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {example.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {cat.id === "power" && (
                    <div className="glass-card p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                      <div className="flex items-start gap-3">
                        <Zap className="w-5 h-5 text-rose-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Pro Tip</p>
                          <p className="text-sm text-muted-foreground">
                            Power tasks combine multiple integrations in one command. The more context you provide, 
                            the smarter Helix can be about helping you.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default HelixCapabilitiesModal;
