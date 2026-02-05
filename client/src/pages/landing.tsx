import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Mic, Brain, Search, Sparkles, Zap, Shield, Clock, Users, 
  Calendar, TrendingUp, ChevronRight, Star, ArrowRight,
  MessageSquare, Lightbulb, Heart, Mail, Wallet, Bot, Sun,
  Target, Bell, MapPin, Compass, FileText, Globe, 
  Smartphone, CheckCircle, BarChart3, Lock
} from "lucide-react";
import { motion } from "framer-motion";
import { KeryxLogo } from "@/components/keryx-logo";
import { KeryxStoryModal } from "@/components/keryx-story-modal";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const slideInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6 } }
};

const slideInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6 } }
};

export default function LandingPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = "Keryx - AI-Powered Life Operating System | Voice Memory Assistant";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Speak naturally. Keryx captures your thoughts, tracks goals, manages reminders, connects calendar and email, and delivers AI-powered insights. Your voice, your entire life, organized.");
    return () => { document.title = "Keryx - AI-Powered Personal Memory Assistant"; };
  }, []);

  const coreFeatures = [
    {
      icon: Mic,
      title: "Voice-First Capture",
      description: "Speak naturally to log memories. No typing, no forms — just talk and Keryx handles the rest with AI-powered transcription.",
      gradient: "from-violet-500 to-purple-600"
    },
    {
      icon: Brain,
      title: "AI-Powered Intelligence",
      description: "GPT extracts topics, mood, people, importance levels, and creates semantic embeddings — all automatically from your words.",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: Search,
      title: "Hybrid Semantic Search",
      description: "Ask questions naturally. Combine meaning-based search with filters for mood, people, topics, dates, and importance.",
      gradient: "from-emerald-500 to-teal-500"
    },
    {
      icon: Sun,
      title: "Morning Briefings",
      description: "Start each day with a personalized AI briefing covering priorities, patterns, goals, reminders, and insights from your life data.",
      gradient: "from-orange-500 to-amber-500"
    },
  ];

  const integrationFeatures = [
    {
      icon: Calendar,
      title: "Calendar Integration",
      description: "Google Calendar and Outlook sync. Auto-link memories to events, detect meetings, and create events from voice commands.",
      gradient: "from-indigo-500 to-violet-500"
    },
    {
      icon: Mail,
      title: "Email Awareness",
      description: "Gmail and Outlook integration brings email context into your briefings, insights, and AI analysis.",
      gradient: "from-red-500 to-pink-500"
    },
    {
      icon: Wallet,
      title: "Financial Insights",
      description: "Connect bank accounts via Plaid for spending breakdowns, financial queries, and money-related pattern detection.",
      gradient: "from-emerald-500 to-green-600"
    },
    {
      icon: MessageSquare,
      title: "Telegram Bot",
      description: "Record memories via text or voice messages from Telegram. Get push notifications and alerts on the go.",
      gradient: "from-sky-500 to-blue-600"
    },
  ];

  const smartFeatures = [
    {
      icon: Target,
      title: "Goals Tracking",
      description: "Set and track long-term goals with AI-powered progress detection. Keryx monitors your memories for goal-related activity automatically.",
      gradient: "from-rose-500 to-red-500"
    },
    {
      icon: Bell,
      title: "Smart Reminders",
      description: "Time-based and location-based reminders auto-detected from your voice. \"Remind me to call mom when I get home\" just works.",
      gradient: "from-amber-500 to-yellow-500"
    },
    {
      icon: Lightbulb,
      title: "Ideas Workspace",
      description: "Capture ideas, notes, lists, and documents with AI brainstorming, task breakdowns, and type-aware assistance at every stage.",
      gradient: "from-yellow-500 to-amber-500"
    },
    {
      icon: MapPin,
      title: "Location History",
      description: "Import Google Timeline data, auto-capture locations from memories, detect frequent places, and add location context to AI insights.",
      gradient: "from-teal-500 to-cyan-500"
    },
    {
      icon: BarChart3,
      title: "Thematic Synthesis",
      description: "Deep pattern analysis across your memories. Interactive AI chat for exploring habits, mood trends, and life insights over time.",
      gradient: "from-purple-500 to-indigo-500"
    },
    {
      icon: Compass,
      title: "Contextual Discoveries",
      description: "AI-powered personalized content suggestions based on your upcoming trips, projects, and life events — always relevant, never ads.",
      gradient: "from-cyan-500 to-blue-500"
    },
    {
      icon: Users,
      title: "People & Relationships",
      description: "Track relationship context automatically. Closeness scores prioritize VIP alerts when important people appear in discoveries.",
      gradient: "from-pink-500 to-rose-500"
    },
    {
      icon: Bot,
      title: "AI Task Execution",
      description: "Create calendar events, send emails, and set reminders — all from voice commands with policy-based approval and rollback.",
      gradient: "from-purple-500 to-fuchsia-500"
    },
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Speak or Type",
      description: "Open Keryx and speak naturally about your day, thoughts, ideas, or anything on your mind. Or type if you prefer.",
      icon: Mic,
      example: "\"Had a great meeting with Sarah about the product launch. We decided to push the deadline to March 15th. I need to follow up with the design team.\"",
    },
    {
      step: "02",
      title: "AI Processes Everything",
      description: "Keryx's AI instantly extracts topics, mood, people mentioned, importance level, calendar events, reminders, and actionable tasks.",
      icon: Brain,
      example: "Topics: Work, Meeting | People: Sarah | Mood: Positive | Importance: 7/10 | Reminder: Follow up with design team | Calendar: Deadline March 15",
    },
    {
      step: "03",
      title: "Search & Rediscover",
      description: "Ask any question naturally — Keryx finds the right memories using semantic understanding, not just keywords.",
      icon: Search,
      example: "\"What did Sarah and I decide about the launch timeline?\" → Finds the exact memory instantly.",
    },
    {
      step: "04",
      title: "Get Proactive Insights",
      description: "Morning briefings, pattern alerts, goal tracking, and contextual discoveries keep you informed without effort.",
      icon: Sparkles,
      example: "\"Good morning! You mentioned the product launch 5 times this week. Sarah is expecting follow-up. Your mood has been positive around project work.\"",
    },
  ];

  const stats = [
    { value: "15+", label: "Smart Categories", description: "Auto-organized by AI" },
    { value: "1-10", label: "Importance Scale", description: "AI-ranked priority" },
    { value: "6+", label: "Integrations", description: "Calendar, email, bank & more" },
    { value: "24/7", label: "Always Learning", description: "Patterns & insights" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-secondary/10 to-transparent pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-accent/10 via-transparent to-transparent pointer-events-none"></div>

      {/* Navigation */}
      <nav className="relative z-50 px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <KeryxStoryModal>
            <KeryxLogo size="md" />
          </KeryxStoryModal>
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              onClick={() => navigate("/login")}
              className="text-foreground hover:text-primary"
              data-testid="button-login-nav"
            >
              Log in
            </Button>
            <Button 
              onClick={() => navigate("/signup")}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white shadow-lg"
              data-testid="button-signup-nav"
            >
              Get Started
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 pt-12 lg:pt-24 pb-20 lg:pb-32">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            className="text-center max-w-4xl mx-auto"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.div variants={fadeIn} className="mb-8 flex justify-center">
              <KeryxStoryModal>
                <KeryxLogo size="hero" showText={false} />
              </KeryxStoryModal>
            </motion.div>
            
            <motion.div variants={fadeIn} className="mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
                <Sparkles className="w-4 h-4" />
                Your AI-Powered Life Operating System
              </span>
            </motion.div>
            
            <motion.h1 
              variants={fadeIn}
              className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-6"
            >
              <span className="text-foreground">Your Voice.</span>
              <br />
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Your Entire Life, Organized.
              </span>
            </motion.h1>
            
            <motion.p 
              variants={fadeIn}
              className="text-lg sm:text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed"
            >
              Speak naturally. Keryx captures your thoughts, tracks your goals, manages your reminders, 
              connects your calendar and email, and delivers personalized insights — all powered by AI 
              that truly understands you.
            </motion.p>
            
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                onClick={() => navigate("/signup")}
                className="bg-gradient-to-r from-primary via-secondary to-accent hover:opacity-90 text-white text-lg px-8 py-6 shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-all"
                data-testid="button-start-free"
              >
                Start Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                size="lg"
                variant="outline"
                onClick={() => navigate("/showcase")}
                className="text-lg px-8 py-6 border-white/20 hover:bg-white/5"
              >
                See All Features
              </Button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div variants={fadeIn} className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-green-500" />
                <span>End-to-end secure</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Powered by GPT-4</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                <span>Works everywhere</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                <span>Free to start</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-16 lg:mt-24 relative max-w-5xl mx-auto"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-3xl blur-3xl opacity-50"></div>
            <div className="relative glass-card-strong rounded-2xl lg:rounded-3xl p-6 lg:p-8 border border-white/20 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-sm text-muted-foreground">Keryx — Voice Log</span>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center animate-pulse">
                    <Mic className="w-12 h-12 lg:w-16 lg:h-16 text-white" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">Listening...</p>
                  <p className="text-sm text-muted-foreground mt-1">"Had a great meeting with Sarah about the product launch. Need to follow up with design by Friday. Also, remind me to call mom tonight."</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">Work</span>
                  <span className="px-3 py-1 rounded-full bg-secondary/20 text-secondary text-sm font-medium">Sarah</span>
                  <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-sm font-medium">Positive</span>
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-medium">Importance: 7</span>
                  <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 text-sm font-medium">Reminder Created</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 bg-muted/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {stats.map((stat, index) => (
              <motion.div key={index} variants={fadeIn} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">{stat.value}</p>
                <p className="text-sm font-semibold text-foreground mt-1">{stat.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              How Keryx
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Works</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From voice to insight in seconds. Here's the magic behind Keryx.
            </motion.p>
          </motion.div>

          <div className="space-y-16 lg:space-y-24">
            {howItWorks.map((item, index) => (
              <motion.div
                key={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-8 lg:gap-16 items-center`}
              >
                <motion.div variants={index % 2 === 0 ? slideInLeft : slideInRight} className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-5xl font-bold bg-gradient-to-r from-primary/30 to-secondary/30 bg-clip-text text-transparent">{item.step}</span>
                    <h3 className="text-2xl sm:text-3xl font-bold text-foreground">{item.title}</h3>
                  </div>
                  <p className="text-lg text-muted-foreground leading-relaxed mb-6">{item.description}</p>
                </motion.div>
                <motion.div variants={index % 2 === 0 ? slideInRight : slideInLeft} className="flex-1 w-full">
                  <div className="glass-card rounded-2xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center`}>
                        <item.icon className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">Example</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed italic">"{item.example}"</p>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              The Foundation of
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Keryx</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Voice capture, AI intelligence, semantic search, and daily briefings — the pillars of your personal life operating system.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid sm:grid-cols-2 gap-6"
          >
            {coreFeatures.map((feature, index) => (
              <motion.div
                key={index}
                variants={fadeIn}
                className="glass-card p-6 lg:p-8 rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 group hover:shadow-xl"
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Smart Features Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Intelligent Features That
              <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent"> Think Ahead</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Keryx doesn't just remember — it understands patterns, tracks your goals, manages your tasks, and proactively helps you live better.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
          >
            {smartFeatures.map((feature, index) => (
              <motion.div
                key={index}
                variants={fadeIn}
                className="glass-card p-5 lg:p-6 rounded-xl border border-white/10 hover:border-white/20 transition-all duration-300 group hover:shadow-xl"
              >
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Connected to
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Your World</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Keryx integrates with the tools you already use. Calendar, email, banking, messaging — all feeding into your personal AI.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
          >
            {integrationFeatures.map((feature, index) => (
              <motion.div
                key={index}
                variants={fadeIn}
                className="glass-card p-5 lg:p-6 rounded-xl border border-white/10 hover:border-white/20 transition-all duration-300 group hover:shadow-xl"
              >
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Proactive Insights Visual Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
                Proactive Intelligence,
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Not Just Memory</span>
              </motion.h2>
              <motion.p variants={fadeIn} className="text-lg text-muted-foreground mb-10 leading-relaxed">
                Keryx doesn't wait for you to ask. It analyzes your patterns, detects when goals stall, 
                notices mood changes, surfaces relevant discoveries, and keeps you one step ahead of your own life.
              </motion.p>
              
              <motion.div variants={staggerContainer} className="space-y-4">
                {[
                  { icon: Sun, text: "Daily briefings tailored to your life context" },
                  { icon: TrendingUp, text: "Pattern alerts when moods or habits shift" },
                  { icon: Target, text: "Goal tracking with automatic progress detection" },
                  { icon: Bell, text: "Smart reminders from natural conversation" },
                  { icon: Compass, text: "Contextual discoveries based on your interests" },
                  { icon: Heart, text: "Wellbeing insights across your personal ecosystem" },
                ].map((item, index) => (
                  <motion.div 
                    key={index}
                    variants={fadeIn}
                    className="flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-foreground">{item.text}</span>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-accent/20 rounded-3xl blur-3xl opacity-50"></div>
              <div className="relative glass-card-strong rounded-2xl p-6 border border-white/20 space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                    <Sun className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Morning Briefing Ready</p>
                    <p className="text-sm text-muted-foreground">3 focus areas, 2 reminders, goal update</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Goal Progress Detected</p>
                    <p className="text-sm text-muted-foreground">"Learn Spanish" — 3 mentions this week (+40%)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Positive Pattern</p>
                    <p className="text-sm text-muted-foreground">Your mood improved 23% this week</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">VIP Alert</p>
                    <p className="text-sm text-muted-foreground">Sarah mentioned in a trending article about your industry</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Multi-Platform Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 bg-muted/30">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Capture From
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Anywhere</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground max-w-2xl mx-auto mb-16">
              Whether you're at your desk, on the go, or wearing smart glasses — Keryx is always ready.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid sm:grid-cols-3 gap-8"
          >
            {[
              {
                icon: Globe,
                title: "Web App",
                description: "Full-featured app accessible from any browser. Push notifications keep you connected.",
                gradient: "from-blue-500 to-cyan-500"
              },
              {
                icon: MessageSquare,
                title: "Telegram",
                description: "Send text or voice messages to your personal Keryx bot. Memories captured instantly.",
                gradient: "from-sky-500 to-blue-600"
              },
              {
                icon: Smartphone,
                title: "Meta Glasses",
                description: "Companion app for Meta smart glasses with geolocation capture and hands-free logging.",
                gradient: "from-violet-500 to-purple-600"
              },
            ].map((platform, index) => (
              <motion.div key={index} variants={fadeIn} className="glass-card p-8 rounded-2xl border border-white/10 hover:border-white/20 transition-all">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${platform.gradient} flex items-center justify-center mb-6 mx-auto shadow-lg`}>
                  <platform.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{platform.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{platform.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Security & Privacy Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
                Your Data,
                <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent"> Your Control</span>
              </motion.h2>
              <motion.p variants={fadeIn} className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Trust is everything. Keryx is built with security and privacy at its core. Your memories are yours — always.
              </motion.p>
            </motion.div>

            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="grid grid-cols-2 gap-4"
            >
              {[
                { icon: Lock, title: "Encrypted Storage", desc: "All data encrypted at rest" },
                { icon: Shield, title: "User Isolation", desc: "Complete data separation" },
                { icon: CheckCircle, title: "Approval Workflows", desc: "Control AI actions" },
                { icon: FileText, title: "Input Validation", desc: "Strict security checks" },
              ].map((item, index) => (
                <motion.div key={index} variants={fadeIn} className="glass-card p-5 rounded-xl border border-white/10 text-center">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                    <item.icon className="w-5 h-5 text-green-400" />
                  </div>
                  <h4 className="font-semibold text-foreground text-sm mb-1">{item.title}</h4>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 bg-muted/30">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeIn} className="mb-8 flex justify-center">
              <KeryxLogo size="xl" showText={false} />
            </motion.div>
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              Your Life Deserves
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent"> Better Memory</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
              Stop losing thoughts to forgotten notes. Keryx is the AI companion that captures, understands, 
              and helps you rediscover every moment that matters.
            </motion.p>
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                onClick={() => navigate("/signup")}
                className="bg-gradient-to-r from-primary via-secondary to-accent hover:opacity-90 text-white text-lg px-10 py-7 shadow-xl shadow-primary/25"
                data-testid="button-get-started-cta"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
            <motion.p variants={fadeIn} className="mt-6 text-sm text-muted-foreground">
              No credit card required. Start capturing memories in seconds.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <KeryxLogo size="sm" textClassName="text-lg" />
          <p className="text-sm text-muted-foreground">
            &copy; 2026 Keryx. Your memories, beautifully organized.
          </p>
        </div>
      </footer>
    </div>
  );
}
