import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Mic, Brain, Search, Sparkles, Zap, Shield, Clock, Users, 
  Calendar, TrendingUp, ChevronRight, Star, ArrowRight,
  MessageSquare, Lightbulb, Heart, Mail, Wallet, Bot, Sun,
  Target, Bell, MapPin, Compass, FileText, Globe, 
  Smartphone, CheckCircle, BarChart3, Lock, ArrowLeft,
  Hash, Layers, Eye, PenTool, ListChecks, Award
} from "lucide-react";
import { motion } from "framer-motion";
import { KeryxLogo, KeryxLogoIcon } from "@/components/keryx-logo";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

function SampleCard({ title, content, tags, mood, importance }: { 
  title: string; content: string; tags: string[]; mood?: string; importance?: number 
}) {
  return (
    <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
      <div className="flex items-start justify-between">
        <h4 className="font-semibold text-foreground text-sm">{title}</h4>
        {importance && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            importance >= 8 ? 'bg-red-500/20 text-red-400' : 
            importance >= 5 ? 'bg-amber-500/20 text-amber-400' : 
            'bg-slate-500/20 text-slate-400'
          }`}>
            {importance}/10
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed italic">"{content}"</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <span key={i} className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">{tag}</span>
        ))}
        {mood && (
          <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary text-xs font-medium">{mood}</span>
        )}
      </div>
    </div>
  );
}

function FeatureSection({ 
  id, icon: Icon, title, subtitle, description, gradient, children, reverse 
}: { 
  id: string; icon: any; title: string; subtitle: string; description: string; 
  gradient: string; children: React.ReactNode; reverse?: boolean 
}) {
  return (
    <section id={id} className="py-16 lg:py-24 border-b border-white/5">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-10 lg:gap-16 items-start`}
      >
        <motion.div variants={fadeIn} className="flex-1 lg:sticky lg:top-8">
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-5 shadow-lg`}>
            <Icon className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">{title}</h2>
          <p className="text-lg text-primary font-medium mb-4">{subtitle}</p>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </motion.div>
        <motion.div variants={fadeIn} className="flex-1 w-full space-y-4">
          {children}
        </motion.div>
      </motion.div>
    </section>
  );
}

export default function ShowcasePage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const title = "Keryx Feature Showcase - Everything Keryx Can Do";
    const desc = "Explore all 20+ features of Keryx: voice capture, AI intelligence, semantic search, goal tracking, smart reminders, calendar & email integration, financial insights, and more.";
    const defaults = {
      title: "Keryx - AI-Powered Personal Memory Assistant",
      desc: "Capture life with just your voice. Keryx is an AI-powered personal memory assistant that lets you log, search, and analyze your memories using natural language.",
    };
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", desc);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", desc);
    return () => {
      document.title = defaults.title;
      document.querySelector('meta[name="description"]')?.setAttribute("content", defaults.desc);
      document.querySelector('meta[property="og:title"]')?.setAttribute("content", defaults.title);
      document.querySelector('meta[property="og:description"]')?.setAttribute("content", defaults.desc);
      document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", defaults.title);
      document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", defaults.desc);
    };
  }, []);

  const tableOfContents = [
    { id: "story", label: "The Keryx Story" },
    { id: "voice", label: "Voice-First Capture" },
    { id: "ai-intelligence", label: "AI Intelligence" },
    { id: "search", label: "Hybrid Semantic Search" },
    { id: "briefings", label: "Morning Briefings" },
    { id: "goals", label: "Goals Tracking" },
    { id: "reminders", label: "Smart Reminders" },
    { id: "ideas", label: "Ideas Workspace" },
    { id: "insights", label: "Pattern Insights" },
    { id: "synthesis", label: "Thematic Synthesis" },
    { id: "discoveries", label: "Contextual Discoveries" },
    { id: "people", label: "People & Relationships" },
    { id: "calendar", label: "Calendar Integration" },
    { id: "email", label: "Email Integration" },
    { id: "financial", label: "Financial Insights" },
    { id: "actions", label: "AI Task Execution" },
    { id: "locations", label: "Location History" },
    { id: "telegram", label: "Telegram Bot" },
    { id: "glasses", label: "Meta Glasses" },
    { id: "notifications", label: "Push Notifications" },
    { id: "timeline", label: "Timeline & History" },
    { id: "security", label: "Security & Privacy" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none"></div>

      {/* Header */}
      <nav className="sticky top-0 z-50 px-4 sm:px-6 lg:px-8 py-4 bg-background/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mr-2" aria-label="Back to home">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <KeryxLogo size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-muted-foreground">Feature Showcase</span>
            <Button 
              size="sm"
              onClick={() => navigate("/signup")}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white"
            >
              Try Keryx Free
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <section className="py-16 lg:py-24 text-center">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.div variants={fadeIn} className="mb-8 flex justify-center">
              <KeryxLogoIcon size="2xl" />
            </motion.div>
            <motion.h1 variants={fadeIn} className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              <span className="text-foreground">Everything </span>
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Keryx</span>
              <span className="text-foreground"> Can Do</span>
            </motion.h1>
            <motion.p variants={fadeIn} className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-12 leading-relaxed">
              A comprehensive guide to the features, capabilities, and vision behind Keryx — the AI-powered 
              life operating system that captures, understands, and enhances your daily life.
            </motion.p>
          </motion.div>

          {/* Table of Contents */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card rounded-2xl p-6 lg:p-8 border border-white/10 text-left max-w-4xl mx-auto"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              What's Inside
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tableOfContents.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors py-1.5 px-3 rounded-lg hover:bg-primary/5 flex items-center gap-2"
                >
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  {item.label}
                </a>
              ))}
            </div>
          </motion.div>
        </section>

        {/* THE KERYX STORY */}
        <section id="story" className="py-16 lg:py-24 border-b border-white/5">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeIn} className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                The Story of
                <span className="bg-gradient-to-r from-cyan-400 via-teal-500 to-amber-500 bg-clip-text text-transparent"> Keryx</span>
              </h2>
            </motion.div>

            <motion.div variants={fadeIn} className="grid lg:grid-cols-2 gap-10 items-start">
              <div className="glass-card rounded-2xl p-8 border border-white/10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-teal-500/20 to-amber-500/20 ring-2 ring-white/10">
                    <KeryxLogoIcon size="lg" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Ancient Origins</h3>
                    <p className="text-sm text-muted-foreground">From Greek heralds to modern AI</p>
                  </div>
                </div>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    Keryx is named after the ancient Greek concept of a <strong className="text-foreground">"keryx"</strong> (pronounced keh-riks), 
                    meaning <strong className="text-foreground">"herald"</strong> or <strong className="text-foreground">"messenger."</strong> In ancient Greece, 
                    these messengers were crucial figures — trusted carriers of important news and announcements across cities, 
                    battlefields, and diplomatic meetings.
                  </p>
                  <p>
                    This role is closely associated with <strong className="text-foreground">Hermes</strong>, the Greek god known for 
                    his speed, eloquence, and role as the divine messenger. The keryx served as a vital link in society, 
                    transmitting messages during times of war, diplomacy, or significant civic events.
                  </p>
                  <p>
                    The messenger archetype represents the bridging of gaps between people, ideas, and cultures. Just as the 
                    ancient keryx connected communities through communication, our Keryx connects the moments of your life — 
                    capturing thoughts, carrying memories, and delivering insights that help you understand your own story.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="glass-card rounded-2xl p-8 border border-white/10">
                  <h3 className="text-xl font-bold text-foreground mb-4">The Modern Herald</h3>
                  <div className="space-y-4 text-muted-foreground leading-relaxed">
                    <p>
                      Today, Keryx carries forward the herald's legacy into the digital age. Where the ancient keryx 
                      carried spoken messages between cities, our Keryx carries your spoken thoughts into a structured, 
                      searchable, intelligent system.
                    </p>
                    <p>
                      <strong className="text-foreground">Kinetic Enterprise & Resource Yielding X-system</strong> — 
                      the full name reflects the dynamic, productive, and forward-thinking nature of the platform. 
                      It's kinetic because it's always in motion, always listening, always learning. It yields 
                      resources — insights, connections, patterns — from the raw material of your daily life.
                    </p>
                  </div>
                </div>

                <div className="glass-card rounded-2xl p-6 border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-3 mb-3">
                    <Award className="w-6 h-6 text-primary" />
                    <h4 className="font-semibold text-foreground">The Vision</h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Keryx is designed to be the one app you reach for first — not to scroll, not to consume, but to 
                    <strong className="text-foreground"> capture the moments that define you</strong>. 
                    Every voice note, every thought, every idea — organized, understood, and ready to serve you 
                    when you need it most.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* VOICE-FIRST CAPTURE */}
        <FeatureSection
          id="voice"
          icon={Mic}
          title="Voice-First Capture"
          subtitle="Speak naturally. Keryx does the rest."
          description="No forms, no buttons, no friction. Just open Keryx and talk. Whether it's a fleeting thought, a meeting recap, or a grocery list — your voice is all you need. Keryx uses browser-native speech recognition for instant capture and OpenAI Whisper for Telegram voice notes."
          gradient="from-violet-500 to-purple-600"
        >
          <SampleCard
            title="Meeting Recap"
            content="Had an excellent strategy session with the marketing team. We agreed to shift the campaign launch to Q2 and increase the social media budget by 30%. Tom is handling the creative brief."
            tags={["Work", "Meeting"]}
            mood="Productive"
            importance={7}
          />
          <SampleCard
            title="Personal Thought"
            content="Feeling really grateful today. The kids performed so well at their school concert. Need to remember to thank Mrs. Johnson for organizing it."
            tags={["Family", "Personal"]}
            mood="Happy"
            importance={6}
          />
          <SampleCard
            title="Quick Reminder"
            content="Need to pick up dry cleaning before Friday and call the dentist to reschedule my appointment."
            tags={["Personal", "Shopping"]}
            mood="Neutral"
            importance={4}
          />
        </FeatureSection>

        {/* AI INTELLIGENCE */}
        <FeatureSection
          id="ai-intelligence"
          icon={Brain}
          title="AI-Powered Intelligence"
          subtitle="GPT processes every memory automatically."
          description="When you log a memory, Keryx's AI instantly extracts rich metadata: topics (from 15 categories), mood, people mentioned, importance level (1-10), calendar references, reminder intents, and actionable tasks. It creates semantic embeddings for meaning-based search. The AI understands context — it knows the difference between 'meeting with Sarah' and 'Sarah's birthday party'."
          gradient="from-blue-500 to-cyan-500"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-4">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-400" />
              What AI Extracts From Your Voice
            </h4>
            <div className="space-y-2.5">
              {[
                { label: "Topics", value: "Work, Meeting, Financial", icon: Hash },
                { label: "Mood", value: "Optimistic, Energized", icon: Heart },
                { label: "People", value: "Sarah Chen, Tom Williams", icon: Users },
                { label: "Importance", value: "7/10 — significant business decision", icon: Star },
                { label: "Calendar", value: "Launch moved to Q2 (detected date)", icon: Calendar },
                { label: "Reminders", value: "\"Follow up with design team\"", icon: Bell },
                { label: "Actions", value: "Send email to Tom about creative brief", icon: Bot },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/5">
                  <div className="w-7 h-7 rounded-md bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <item.icon className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase">{item.label}</span>
                    <p className="text-sm text-foreground">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card rounded-xl p-5 border border-white/10">
            <h4 className="font-semibold text-foreground text-sm mb-3">15 Smart Categories</h4>
            <div className="flex flex-wrap gap-2">
              {["Work", "Family", "Social", "Health", "Financial", "Shopping", "Groceries", "Travel", 
                "Learning", "Home", "Recreation", "Food", "Meeting", "Personal", "General"].map((cat) => (
                <span key={cat} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{cat}</span>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* HYBRID SEMANTIC SEARCH */}
        <FeatureSection
          id="search"
          icon={Search}
          title="Hybrid Semantic Search"
          subtitle="Ask questions naturally. Find anything instantly."
          description="Keryx combines semantic vector search (understanding meaning) with structured filters (dates, topics, people, mood, importance). Ask 'what did I discuss with Sarah about the project deadline?' and Keryx finds the exact memory — even if you never used the word 'deadline' in your original recording."
          gradient="from-emerald-500 to-teal-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-4">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              Sample Searches
            </h4>
            <div className="space-y-3">
              {[
                { query: "What did Sarah say about the project timeline?", result: "Found: Strategy session on Jan 15 — launch moved to Q2" },
                { query: "Show me all happy memories about family from last month", result: "Found: 8 memories tagged Family with positive mood" },
                { query: "When did I last mention the dentist?", result: "Found: Quick reminder on Jan 20 — reschedule appointment" },
                { query: "Important financial decisions this quarter", result: "Found: 3 high-importance (8+) financial memories" },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/5 space-y-1.5">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Search className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    {item.query}
                  </p>
                  <p className="text-xs text-muted-foreground ml-5">{item.result}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card rounded-xl p-5 border border-white/10">
            <h4 className="font-semibold text-foreground text-sm mb-3">Filter Options</h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {["Date Range", "Topic Category", "People Mentioned", "Mood", "Importance Level", "Calendar Events", "Location", "Keywords"].map((filter) => (
                <span key={filter} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">{filter}</span>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* MORNING BRIEFINGS */}
        <FeatureSection
          id="briefings"
          icon={Sun}
          title="Morning Briefings"
          subtitle="Start every day informed and intentional."
          description="Each morning, Keryx generates a personalized briefing combining your recent memories, calendar events, emails, financial data, active goals, pending reminders, and pattern insights. It's like having a personal chief of staff who knows everything about your life and distills it into a clear daily overview."
          gradient="from-orange-500 to-amber-500"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-orange-500/20 bg-orange-500/5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Good Morning!</h4>
                <p className="text-xs text-muted-foreground">Wednesday, February 5, 2026</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-white/5">
                <p className="font-medium text-foreground mb-1">Today's Focus</p>
                <p className="text-muted-foreground">You have a strategy meeting at 10 AM with Sarah. Review the Q2 campaign numbers beforehand. Your "Learn Spanish" goal hasn't been mentioned in 5 days — consider a quick session today.</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="font-medium text-foreground mb-1">Pending Reminders</p>
                <p className="text-muted-foreground">Call mom tonight (set yesterday). Follow up with design team about creative brief (2 days ago).</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="font-medium text-foreground mb-1">Pattern Alert</p>
                <p className="text-muted-foreground">Your mood has been consistently positive this week when discussing project work. Energy levels tend to dip on Wednesday afternoons — plan accordingly.</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="font-medium text-foreground mb-1">Email Highlights</p>
                <p className="text-muted-foreground">3 important emails received since yesterday. One from Sarah about updated launch materials.</p>
              </div>
            </div>
          </div>
        </FeatureSection>

        {/* GOALS TRACKING */}
        <FeatureSection
          id="goals"
          icon={Target}
          title="Goals Tracking"
          subtitle="Set it and Keryx tracks it for you."
          description="Create long-term goals and let Keryx's AI monitor your progress automatically. It scans your daily memories for goal-related activity, detects when you're making progress or falling behind, suggests milestones, and integrates goal updates into your morning briefings. No manual tracking needed — just live your life and Keryx notices the patterns."
          gradient="from-rose-500 to-red-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-4">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-400" />
              Sample Goals
            </h4>
            <div className="space-y-3">
              {[
                { 
                  name: "Learn Spanish", progress: 45, status: "Active",
                  insight: "3 mentions this week. Completed Duolingo Unit 7. AI suggests: practice conversation with native speakers next."
                },
                { 
                  name: "Run a Half Marathon", progress: 30, status: "Active",
                  insight: "Logged 3 runs this week, totaling 15 miles. On track for March target. Milestone: 10-mile run achieved!"
                },
                { 
                  name: "Launch Side Project", progress: 70, status: "Active",
                  insight: "Mentioned 8 times in last 2 weeks. Key blocker: waiting on design assets. Stall alert triggered."
                },
              ].map((goal, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm">{goal.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">{goal.status}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full" style={{ width: `${goal.progress}%` }}></div>
                  </div>
                  <p className="text-xs text-muted-foreground">{goal.insight}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card rounded-xl p-5 border border-white/10">
            <h4 className="font-semibold text-foreground text-sm mb-3">AI-Powered Features</h4>
            <div className="space-y-2">
              {[
                "Automatic progress detection from daily memories",
                "AI-suggested milestones based on your goal",
                "Stall alerts when no progress detected for 7+ days",
                "At-risk alerts for goals approaching deadlines",
                "Achievement celebrations when milestones are completed",
                "Goal updates integrated into morning briefings",
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* SMART REMINDERS */}
        <FeatureSection
          id="reminders"
          icon={Bell}
          title="Smart Reminders"
          subtitle="Detected from your voice. Triggered at the right moment."
          description="Say 'remind me to call mom when I get home' or 'I need to follow up with Tom on Friday' — Keryx's AI automatically detects reminder intents from your voice input and creates them. Supports both time-based ('tomorrow at 3pm') and location-based ('when I'm at the gym') triggers. Snooze, complete, or dismiss with a tap."
          gradient="from-amber-500 to-yellow-500"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Active Reminders
            </h4>
            {[
              { content: "Call mom tonight", type: "Time", trigger: "Today, 7:00 PM", status: "pending" },
              { content: "Follow up with design team", type: "Time", trigger: "Friday, 10:00 AM", status: "pending" },
              { content: "Pick up dry cleaning", type: "Location", trigger: "When near: Downtown Cleaners", status: "pending" },
              { content: "Ask about gym membership discount", type: "Location", trigger: "When at: Gym", status: "snoozed" },
            ].map((reminder, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/5 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  reminder.type === "Time" ? "bg-amber-500/20" : "bg-teal-500/20"
                }`}>
                  {reminder.type === "Time" ? 
                    <Clock className="w-4 h-4 text-amber-400" /> : 
                    <MapPin className="w-4 h-4 text-teal-400" />
                  }
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{reminder.content}</p>
                  <p className="text-xs text-muted-foreground">{reminder.trigger}</p>
                </div>
                {reminder.status === "snoozed" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">Snoozed</span>
                )}
              </div>
            ))}
          </div>
          <div className="glass-card rounded-xl p-5 border border-white/10">
            <h4 className="font-semibold text-foreground text-sm mb-3">How It Works</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Speak naturally: <em className="text-foreground">"Remind me to buy flowers before Saturday"</em></p>
              <p>2. AI detects the reminder intent and time reference</p>
              <p>3. Reminder auto-created with Saturday trigger</p>
              <p>4. Notification sent when trigger fires</p>
              <p>5. Snooze (30m, 1h), complete, or dismiss</p>
            </div>
          </div>
        </FeatureSection>

        {/* IDEAS WORKSPACE */}
        <FeatureSection
          id="ideas"
          icon={Lightbulb}
          title="Ideas & Workspace"
          subtitle="From spark to reality. AI-assisted every step."
          description="A versatile workspace supporting four types: Ideas (full AI brainstorming with stages), Notes (quick text capture), Lists (checkable items like grocery or packing lists), and Documents (structured content). Each type gets specialized AI assistance — list item suggestions, note summarization, writing feedback, and brainstorming. Ideas progress through stages: Spark, Exploring, Planning, In Progress, Completed."
          gradient="from-yellow-500 to-amber-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-4">
            <h4 className="font-semibold text-foreground text-sm">Workspace Types</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Lightbulb, name: "Ideas", desc: "Full AI brainstorming with stage progression", color: "text-amber-400 bg-amber-500/20" },
                { icon: PenTool, name: "Notes", desc: "Quick text capture with AI summarization", color: "text-blue-400 bg-blue-500/20" },
                { icon: ListChecks, name: "Lists", desc: "Checkable items with AI suggestions", color: "text-emerald-400 bg-emerald-500/20" },
                { icon: FileText, name: "Documents", desc: "Structured content with writing feedback", color: "text-purple-400 bg-purple-500/20" },
              ].map((type, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/5 space-y-2">
                  <div className={`w-8 h-8 rounded-lg ${type.color} flex items-center justify-center`}>
                    <type.icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{type.name}</p>
                  <p className="text-xs text-muted-foreground">{type.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card rounded-xl p-5 border border-white/10">
            <h4 className="font-semibold text-foreground text-sm mb-3">Idea Stages</h4>
            <div className="flex items-center gap-2 flex-wrap">
              {["Spark", "Exploring", "Planning", "In Progress", "Completed"].map((stage, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">{stage}</span>
                  {i < 4 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* PATTERN INSIGHTS */}
        <FeatureSection
          id="insights"
          icon={TrendingUp}
          title="Pattern Insights"
          subtitle="Discover trends you never noticed."
          description="AI-generated insights from your entire ecosystem — memories, calendars, emails, finances. Track mood distributions, topic frequency, people interaction patterns, and wellbeing trends. Categories include people, projects, calendar, financial, wellbeing, and highlights. All cached for fast access."
          gradient="from-amber-500 to-orange-500"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-4">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400" />
              Sample Insights
            </h4>
            <div className="space-y-3">
              {[
                { cat: "Wellbeing", insight: "Your mood peaks on Tuesdays and dips on Thursday afternoons. Consider lighter scheduling on Thursdays." },
                { cat: "People", insight: "You've mentioned Sarah 23 times this month — your most frequent collaboration partner. Your mood is consistently positive in these interactions." },
                { cat: "Financial", insight: "Restaurant spending increased 40% this month compared to your 3-month average. Most activity on weekends." },
                { cat: "Projects", insight: "The product launch has been your dominant topic for 3 weeks. You're most productive when you discuss it with Tom." },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/5">
                  <span className="text-xs font-medium text-primary uppercase">{item.cat}</span>
                  <p className="text-sm text-muted-foreground mt-1">{item.insight}</p>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* THEMATIC SYNTHESIS */}
        <FeatureSection
          id="synthesis"
          icon={BarChart3}
          title="Thematic Synthesis"
          subtitle="Deep analysis with interactive AI chat."
          description="Go beyond surface-level insights with comprehensive thematic analysis. Auto-generates a deep analysis covering patterns, habits, mood trends, and recommendations across configurable time periods (7 days to 1 year). Then ask follow-up questions in an interactive chat: 'What are my stress triggers?' or 'How have my priorities shifted this quarter?'"
          gradient="from-purple-500 to-indigo-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              Sample Synthesis Chat
            </h4>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-xs text-purple-400 font-medium mb-1">You asked:</p>
                <p className="text-sm text-foreground">"What are my biggest stress triggers over the past month?"</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-muted-foreground font-medium mb-1">Keryx analyzed 47 memories and found:</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your primary stress triggers are: (1) deadline pressure, appearing in 12 memories with negative mood, 
                  (2) back-to-back meetings on Wednesdays, and (3) financial uncertainty around the project budget. 
                  Interestingly, your stress consistently drops after exercise — running appeared 6 times paired with 
                  improved mood within 24 hours.
                </p>
              </div>
            </div>
          </div>
        </FeatureSection>

        {/* CONTEXTUAL DISCOVERIES */}
        <FeatureSection
          id="discoveries"
          icon={Compass}
          title="Contextual Discoveries"
          subtitle="Personalized content, never ads."
          description="Powered by Tavily AI Search, discoveries are contextual web results based on your actual life — upcoming trips, active projects, financial patterns, and interests extracted from your memories. Features urgency badges (immediate/upcoming/general), location awareness for travel, and VIP alerts when high-priority people appear in results."
          gradient="from-cyan-500 to-blue-500"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              Sample Discoveries
            </h4>
            {[
              { title: "Best restaurants near your hotel in Barcelona", urgency: "Upcoming", source: "Calendar: Trip to Barcelona next week" },
              { title: "Latest trends in Q2 marketing campaigns", urgency: "General", source: "Memories: Frequent mentions of campaign strategy" },
              { title: "Sarah Chen quoted in industry article", urgency: "Immediate", source: "VIP Alert: Priority 9 person mentioned", vip: true },
            ].map((disc, i) => (
              <div key={i} className={`p-3 rounded-lg ${disc.vip ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-white/5'} space-y-1.5`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{disc.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    disc.urgency === 'Immediate' ? 'bg-red-500/20 text-red-400' :
                    disc.urgency === 'Upcoming' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>{disc.urgency}</span>
                </div>
                <p className="text-xs text-muted-foreground">{disc.source}</p>
              </div>
            ))}
          </div>
        </FeatureSection>

        {/* PEOPLE & RELATIONSHIPS */}
        <FeatureSection
          id="people"
          icon={Users}
          title="People & Relationships"
          subtitle="Your personal relationship context engine."
          description="Keryx automatically detects people mentioned in your memories and builds a relationship graph. Assign closeness scores (1-10) to prioritize VIP alerts. Priority 10 is for your closest people (spouse, partner), 9 for close family and business partners, 8 for close friends. High-priority people trigger special alerts when they appear in contextual discoveries."
          gradient="from-pink-500 to-rose-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-pink-400" />
              People Graph
            </h4>
            {[
              { name: "Sarah Chen", priority: 9, mentions: 23, label: "Business Partner", mood: "Consistently positive" },
              { name: "Tom Williams", priority: 7, mentions: 15, label: "Colleague", mood: "Mixed — project stress" },
              { name: "Mom", priority: 10, mentions: 8, label: "Family", mood: "Always warm" },
              { name: "Dr. Rivera", priority: 5, mentions: 3, label: "Healthcare", mood: "Neutral" },
            ].map((person, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/5 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  person.priority >= 9 ? 'bg-gradient-to-br from-rose-500 to-pink-600' :
                  person.priority >= 7 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                  'bg-gradient-to-br from-slate-500 to-zinc-600'
                }`}>
                  {person.name[0]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{person.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary">{person.priority}/10</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{person.mentions} mentions · {person.label} · {person.mood}</p>
                </div>
              </div>
            ))}
          </div>
        </FeatureSection>

        {/* CALENDAR INTEGRATION */}
        <FeatureSection
          id="calendar"
          icon={Calendar}
          title="Calendar Integration"
          subtitle="Google Calendar & Outlook, seamlessly connected."
          description="Connect your Google Calendar or Microsoft Outlook to auto-link memories to events, detect meeting contexts, and create new events directly from voice commands. When you say 'schedule a follow-up with Tom next Tuesday at 2pm,' Keryx creates the event for you (with your approval). Calendar context enriches your morning briefings and AI insights."
          gradient="from-indigo-500 to-violet-500"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            {[
              { action: "Auto-Link", desc: "Memory about strategy meeting automatically linked to your 10 AM calendar event" },
              { action: "Event Creation", desc: "\"Schedule call with Tom next Tuesday 2pm\" → Calendar event created with your approval" },
              { action: "Context Enrichment", desc: "Morning briefing includes: \"You have 4 meetings today. Your 2pm with Sarah was rescheduled.\"" },
              { action: "Smart Detection", desc: "AI detects \"the meeting yesterday\" and links to the most relevant recent event" },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/5">
                <span className="text-xs font-medium text-indigo-400 uppercase">{item.action}</span>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </FeatureSection>

        {/* EMAIL INTEGRATION */}
        <FeatureSection
          id="email"
          icon={Mail}
          title="Email Integration"
          subtitle="Gmail & Outlook awareness built in."
          description="Connect Gmail or Outlook to bring email context into Keryx's intelligence. Your morning briefings include email highlights, AI insights factor in email patterns, and you can send emails via voice commands. Keryx reads your recent emails to provide a holistic view of your life without you checking your inbox."
          gradient="from-red-500 to-pink-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Mail className="w-4 h-4 text-red-400" />
              Email-Powered Features
            </h4>
            <div className="space-y-2">
              {[
                "Morning briefing email highlights — important emails summarized",
                "AI insights enriched with email context",
                "Send emails via voice: \"Email Sarah the meeting notes\"",
                "Email patterns tracked for proactive alerts",
                "Contextual discoveries enhanced with email content",
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* FINANCIAL INSIGHTS */}
        <FeatureSection
          id="financial"
          icon={Wallet}
          title="Financial Insights"
          subtitle="Your spending, understood."
          description="Connect bank accounts securely via Plaid to bring financial context into Keryx. See spending breakdowns, detect notable transactions, ask financial questions naturally, and get spending pattern alerts. Financial data integrates into morning briefings and contextual discoveries for a truly holistic view of your life."
          gradient="from-emerald-500 to-green-600"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            {[
              { query: "How much did I spend on restaurants this month?", answer: "$342 across 12 transactions, up 40% from last month average" },
              { query: "What's my biggest expense this week?", answer: "$850 — Home Depot on Saturday (categorized: Home)" },
              { query: "Am I on track with my monthly budget?", answer: "You've spent 62% of your typical monthly total with 40% of the month remaining. Careful with discretionary spending." },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/5 space-y-1.5">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Wallet className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  {item.query}
                </p>
                <p className="text-xs text-muted-foreground ml-5">{item.answer}</p>
              </div>
            ))}
          </div>
        </FeatureSection>

        {/* AI TASK EXECUTION */}
        <FeatureSection
          id="actions"
          icon={Bot}
          title="AI Task Execution"
          subtitle="Your voice becomes action."
          description="When Keryx detects actionable requests in your voice input, it can execute them: create calendar events, send emails, set reminders, and more. Every action goes through a policy-based approval workflow you control — approve automatically, require confirmation, or disable entirely. Full rollback capability ensures nothing goes wrong."
          gradient="from-purple-500 to-fuchsia-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-400" />
              Action Examples
            </h4>
            {[
              { voice: "Schedule a team standup every Monday at 9am", action: "Calendar: Create recurring event", policy: "Auto-approve" },
              { voice: "Email Tom the updated project timeline", action: "Email: Draft and send to Tom Williams", policy: "Require confirmation" },
              { voice: "Remind me to submit the report by end of day Friday", action: "Reminder: Create time-based trigger", policy: "Auto-approve" },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/5 space-y-2">
                <p className="text-sm text-foreground italic">"{item.voice}"</p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">{item.action}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">{item.policy}</span>
                </div>
              </div>
            ))}
          </div>
        </FeatureSection>

        {/* LOCATION HISTORY */}
        <FeatureSection
          id="locations"
          icon={MapPin}
          title="Location History"
          subtitle="Where you've been matters."
          description="Import your Google Timeline data (supports legacy and semantic JSON formats), auto-capture locations from memories, detect frequent places with smart home/work auto-labeling, and add custom place names (Gym, Coffee Shop, etc.). Location context flows into AI briefings, triggers location-based reminders, and enriches your memory timeline."
          gradient="from-teal-500 to-cyan-500"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-400" />
              Location Features
            </h4>
            <div className="space-y-2">
              {[
                "Google Timeline import (legacy + semantic formats)",
                "Automatic location capture from memories with geolocation",
                "Frequent place detection with clustering algorithms",
                "Home and work auto-labeling",
                "Custom place naming (Gym, Coffee Shop, Mom's House)",
                "Location context integrated into AI briefings",
                "Location-based reminder triggering",
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* TELEGRAM */}
        <FeatureSection
          id="telegram"
          icon={MessageSquare}
          title="Telegram Bot"
          subtitle="Your pocket messenger for memories."
          description="Link your Telegram account to your Keryx profile and send memories via text or voice messages from anywhere. Voice notes are processed with OpenAI Whisper for accurate transcription. Receive push notifications for briefings, alerts, and VIP mentions. Perfect for capturing thoughts on the go without opening the app."
          gradient="from-sky-500 to-blue-600"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              Telegram Interaction
            </h4>
            <div className="space-y-2.5">
              <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20">
                <p className="text-xs text-sky-400 font-medium mb-1">You sent (voice note):</p>
                <p className="text-sm text-foreground italic">"Just left the client meeting. They loved the proposal. Contract signing next week. Feeling excited!"</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-muted-foreground font-medium mb-1">Keryx responds:</p>
                <p className="text-sm text-muted-foreground">Logged! Topics: Work, Meeting. Mood: Excited. People: [client]. Importance: 8/10. Would you like me to add a calendar event for the contract signing?</p>
              </div>
            </div>
          </div>
        </FeatureSection>

        {/* META GLASSES */}
        <FeatureSection
          id="glasses"
          icon={Smartphone}
          title="Meta Glasses Companion"
          subtitle="Hands-free memory capture."
          description="The companion app (built with React Native) connects to Meta smart glasses for truly hands-free memory capture. Geolocation is captured automatically, device context is included, and the MCP Protocol 2025-01 ensures reliable communication. Log memories while walking, driving, or working without reaching for your phone."
          gradient="from-violet-500 to-purple-600"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-violet-400" />
              Companion App Features
            </h4>
            <div className="space-y-2">
              {[
                "React Native companion app for Meta smart glasses",
                "Hands-free voice capture with geolocation",
                "MCP Protocol 2025-01 compliant payloads",
                "Device context included in memory metadata",
                "Automatic location capture from GPS",
                "Seamless sync with main Keryx app",
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* PUSH NOTIFICATIONS */}
        <FeatureSection
          id="notifications"
          icon={Bell}
          title="Push Notifications"
          subtitle="Stay connected, even when away."
          description="Web Push notifications keep you informed wherever you are. Receive morning briefings, pattern alerts, VIP mentions, goal updates, contextual discoveries, and AI action approvals — all delivered directly to your device. Built with VAPID authentication and a dedicated service worker for reliable, instant delivery."
          gradient="from-indigo-500 to-blue-500"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" />
              Notification Types
            </h4>
            <div className="space-y-2">
              {[
                "Morning briefing summaries delivered at your preferred time",
                "Pattern alerts when mood or activity trends shift",
                "VIP alerts when priority 8+ people appear in discoveries",
                "Goal progress updates and milestone celebrations",
                "Reminder triggers for time-based and location-based alerts",
                "AI action approval requests for pending tasks",
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* TIMELINE & HISTORY */}
        <FeatureSection
          id="timeline"
          icon={Clock}
          title="Timeline & History"
          subtitle="Your life story, beautifully visualized."
          description="Browse all your memories in a rich timeline view with calendar navigation, card or table views, and powerful filtering. See your memories organized by date with mood indicators, people tags, importance badges, and category labels. Edit, recategorize, or delete memories anytime. The history page provides full-text search, topic filters, and date range selection."
          gradient="from-slate-500 to-zinc-600"
          reverse
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Timeline Features
            </h4>
            <div className="space-y-2">
              {[
                "Calendar-based navigation with date picker",
                "Card view and table view for different browsing styles",
                "Filter by topic, mood, people, importance, and date range",
                "Calendar event filter to see event-linked memories",
                "Edit memory content, category, and importance inline",
                "Bulk selection for batch operations",
                "Full-text search across all memories",
                "Importance badges with visual priority indicators",
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* SECURITY & PRIVACY */}
        <FeatureSection
          id="security"
          icon={Shield}
          title="Security & Privacy"
          subtitle="Your data. Your control. Always."
          description="Keryx is built with enterprise-grade security. All routes require authentication, complete user data isolation prevents cross-user access, Telegram webhooks use HMAC validation, rate limiting prevents abuse, all inputs are validated with Zod schemas, and AI actions require user-defined approval policies. Your memories are yours — always."
          gradient="from-green-500 to-emerald-600"
        >
          <div className="glass-card rounded-xl p-5 border border-white/10 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Lock, title: "Session Auth", desc: "All 80+ routes require authentication" },
                { icon: Shield, title: "Data Isolation", desc: "Complete user data separation — no cross-user access" },
                { icon: CheckCircle, title: "Input Validation", desc: "Zod schemas validate every API request" },
                { icon: Zap, title: "Rate Limiting", desc: "Per-user rate limiting on all AI routes" },
                { icon: FileText, title: "Approval Policies", desc: "Control AI actions with configurable policies" },
                { icon: Globe, title: "Webhook Security", desc: "HMAC-SHA256 for Telegram webhook validation" },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/5 space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-green-400" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </FeatureSection>

        {/* FINAL CTA */}
        <section className="py-20 lg:py-32 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeIn} className="mb-8 flex justify-center">
              <KeryxLogoIcon size="xl" />
            </motion.div>
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              This Is
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent"> Keryx</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground mb-4 max-w-2xl mx-auto">
              The AI companion that captures your voice, understands your life, tracks your goals, 
              manages your tasks, and delivers insights you never knew you needed.
            </motion.p>
            <motion.p variants={fadeIn} className="text-lg text-foreground font-medium mb-10 max-w-2xl mx-auto">
              One app. Your entire life. Beautifully organized.
            </motion.p>
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                onClick={() => navigate("/signup")}
                className="bg-gradient-to-r from-primary via-secondary to-accent hover:opacity-90 text-white text-lg px-10 py-7 shadow-xl shadow-primary/25"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
            <motion.p variants={fadeIn} className="mt-6 text-sm text-muted-foreground">
              No credit card required. Start capturing memories in seconds.
            </motion.p>
          </motion.div>
        </section>
      </div>

      {/* Footer */}
      <footer className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <KeryxLogo size="sm" textClassName="text-lg" />
          <p className="text-sm text-muted-foreground">
            &copy; 2026 Keryx. Your memories, beautifully organized.
          </p>
        </div>
      </footer>
    </div>
  );
}
