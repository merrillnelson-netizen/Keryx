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
  Sparkles,
  Wallet,
  Lightbulb,
  TrendingUp,
  Newspaper,
  Compass,
  Target,
  Bell,
  Smartphone
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
      { phrase: "Schedule a monthly review on the first Monday at 9am", description: "Creates a recurring monthly event" },
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
      { phrase: "Email the team about the project update", description: "Sends a message to multiple recipients" },
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
      { phrase: "Send voice notes to Keryx via Telegram", description: "Record memories hands-free from your phone" },
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
    id: "finance",
    name: "Finance",
    icon: Wallet,
    color: "text-emerald-500",
    description: "Track spending, analyze transactions, and get financial insights",
    examples: [
      { phrase: "How much did I spend this week?", description: "Shows total spending with category breakdown" },
      { phrase: "What are my biggest expenses this month?", description: "Identifies top spending categories and merchants" },
      { phrase: "How much did I spend on food last week?", description: "Filters spending by specific category" },
      { phrase: "Show me my recent transactions", description: "Lists your latest financial transactions" },
      { phrase: "What's my balance?", description: "Shows current account balances across linked accounts" },
      { phrase: "Where is my money going?", description: "Provides spending pattern analysis and insights" },
    ]
  },
  {
    id: "ideas",
    name: "Ideas",
    icon: Lightbulb,
    color: "text-yellow-500",
    description: "Brainstorm and develop ideas through AI-powered conversation",
    examples: [
      { phrase: "I have an idea for a mobile app", description: "Start developing a new idea with AI guidance" },
      { phrase: "Help me think through this business concept", description: "Get AI assistance refining your idea" },
      { phrase: "Break this project into actionable tasks", description: "AI generates a task list for your idea" },
      { phrase: "What are the pros and cons of this approach?", description: "Get balanced analysis of your idea" },
      { phrase: "How can I make this idea better?", description: "Receive suggestions to improve your concept" },
    ]
  },
  {
    id: "goals",
    name: "Goals",
    icon: Target,
    color: "text-orange-500",
    description: "Track long-term goals with AI-powered progress analysis",
    examples: [
      { phrase: "Set a goal to learn Spanish this year", description: "Create a goal with milestones and track progress" },
      { phrase: "How am I doing on my fitness goal?", description: "AI analyzes your memories to assess progress" },
      { phrase: "Suggest milestones for my career goal", description: "Get AI-generated actionable steps" },
      { phrase: "Which of my goals need attention?", description: "Get alerts for stalled or at-risk goals" },
      { phrase: "Show me my goal achievements this month", description: "Celebrate completed milestones and progress" },
    ]
  },
  {
    id: "reminders",
    name: "Reminders",
    icon: Bell,
    color: "text-pink-500",
    description: "Set time-based and location-based reminders that Keryx tracks for you",
    examples: [
      { phrase: "Remind me to call mom tomorrow at 3pm", description: "Creates a time-based reminder with notification" },
      { phrase: "Remind me to buy milk when I'm at the grocery store", description: "Location-based reminder that triggers when you're there" },
      { phrase: "Remind me in 2 hours to take a break", description: "Quick time offset for immediate reminders" },
      { phrase: "Remind me when I'm at the gym to ask about classes", description: "Location-triggered reminder at a specific place" },
      { phrase: "Set a reminder for next Monday to submit the report", description: "Future date reminder with automatic tracking" },
    ]
  },
  {
    id: "synthesis",
    name: "Synthesis",
    icon: TrendingUp,
    color: "text-indigo-500",
    description: "Deep pattern analysis and thematic insights from your memories",
    examples: [
      { phrase: "What patterns do you see in my life lately?", description: "AI analyzes themes across your memories" },
      { phrase: "What should I focus on this month?", description: "Get personalized recommendations based on patterns" },
      { phrase: "How have my priorities shifted over time?", description: "Understand your evolving focus areas" },
      { phrase: "What habits are helping or hurting me?", description: "Identify behavioral patterns in your data" },
      { phrase: "Give me a deep analysis of my work-life balance", description: "Comprehensive thematic synthesis" },
    ]
  },
  {
    id: "insights",
    name: "Insights",
    icon: Newspaper,
    color: "text-cyan-500",
    description: "AI-generated stories about your life from calendars, emails, and memories",
    examples: [
      { phrase: "What's happening in my life right now?", description: "News-style stories about your ecosystem" },
      { phrase: "Tell me about my upcoming week", description: "Personalized preview of what's ahead" },
      { phrase: "What connections am I nurturing?", description: "Insights about your relationships" },
      { phrase: "How are my projects progressing?", description: "Status updates on your active work" },
      { phrase: "What financial trends should I know about?", description: "Money patterns from your spending data" },
    ]
  },
  {
    id: "discoveries",
    name: "Discoveries",
    icon: Compass,
    color: "text-teal-500",
    description: "Personalized content recommendations based on your life context",
    examples: [
      { phrase: "Find articles relevant to my projects", description: "Web content matched to your current work" },
      { phrase: "Discover content for my upcoming trip", description: "Travel tips based on your calendar events" },
      { phrase: "What should I read about my interests?", description: "Curated content from your memory topics" },
      { phrase: "Find resources for my current challenges", description: "Helpful content based on what's on your mind" },
      { phrase: "Explore topics I've been thinking about", description: "Deep dives into your recurring themes" },
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
      { phrase: "How much did I spend after each meeting this week?", description: "Cross-reference spending with calendar events" },
    ]
  },
  {
    id: "messages",
    name: "Messages",
    icon: Smartphone,
    color: "text-violet-500",
    description: "Browse and search your SMS/text history — imported archives and live relay via Chrome Extension",
    examples: [
      { phrase: "Show my recent messages from Mom", description: "Browse texts from a specific contact in the chat bubble view" },
      { phrase: "What did Jake and I talk about last week?", description: "Search imported or relayed conversation history by person and date" },
      { phrase: "Import my SMS backup from Android", description: "Upload an SMS archive (NDJSON/ZIP) from the SMS Import / Export app (F-Droid)" },
      { phrase: "Set up the Chrome Extension to relay live messages", description: "Install the extension so new Google Messages for Web texts sync automatically" },
      { phrase: "Delete relayed messages from a conversation", description: "Use the trash icon in any conversation to remove relay-sourced messages" },
    ]
  }
];

const hintExamples = [
  "Schedule a meeting with Sarah tomorrow at 2pm",
  "What was I thinking about last week?",
  "Remind me to call mom tomorrow at 3pm",
  "Summarize my unread emails",
  "Remember I met Jake at the coffee shop",
  "How much did I spend this week?",
  "How was I feeling yesterday?",
  "Block Friday afternoon for focused work",
  "What are my biggest expenses?",
  "Any important emails I should check?",
  "Remind me when I'm at the gym to ask about classes",
  "Send an email to John about the project",
  "I have an idea for a new app",
  "What patterns do you see in my life?",
  "What's happening in my life right now?",
  "Find content relevant to my projects",
  "How am I doing on my fitness goal?",
  "Remind me in 2 hours to take a break",
  "Show my recent messages from Mom",
  "Import my SMS backup from Android",
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

export function KeryxCapabilitiesModal() {
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
          <span>What can Keryx do?</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[85vh] sm:h-auto sm:max-h-[85vh] glass-card-strong border-white/20 p-0 flex flex-col">
        <DialogHeader className="p-4 sm:p-6 pb-0 shrink-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            What Keryx Can Do For You
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2 text-sm">
            Explore all the ways Keryx can help manage your memories, calendar, email, and more
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="calendar" className="flex flex-col flex-1 min-h-0">
          <div className="px-4 sm:px-6 pt-4 shrink-0">
            <TabsList className="w-full h-auto grid grid-cols-3 sm:grid-cols-4 bg-white/5 p-1 rounded-xl gap-1">
              {capabilities.map(cat => {
                const Icon = cat.icon;
                return (
                  <TabsTrigger
                    key={cat.id}
                    value={cat.id}
                    className="flex items-center justify-center gap-1.5 text-xs sm:text-sm data-[state=active]:bg-white/10 px-2 py-1.5 sm:px-3"
                    data-testid={`tab-capability-${cat.id}`}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", cat.color)} />
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
                      cat.id === "finance" && "bg-emerald-500/20",
                      cat.id === "ideas" && "bg-yellow-500/20",
                      cat.id === "goals" && "bg-orange-500/20",
                      cat.id === "reminders" && "bg-pink-500/20",
                      cat.id === "synthesis" && "bg-indigo-500/20",
                      cat.id === "insights" && "bg-cyan-500/20",
                      cat.id === "discoveries" && "bg-teal-500/20",
                      cat.id === "power" && "bg-rose-500/20",
                      cat.id === "messages" && "bg-violet-500/20"
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
                            the smarter Keryx can be about helping you.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {cat.id === "messages" && (
                    <div className="glass-card p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                      <div className="flex items-start gap-3">
                        <Smartphone className="w-5 h-5 text-violet-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Two ways to get messages in</p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Archive import:</strong> Export from the "SMS Import / Export" Android app (F-Droid) and upload the NDJSON/ZIP file in Settings → Integrations.<br />
                            <strong>Live relay:</strong> Install the Chrome Extension so new texts from Google Messages for Web sync automatically as you send and receive them — no manual exports needed.
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

export { KeryxCapabilitiesModal as HelixCapabilitiesModal };
export default KeryxCapabilitiesModal;
