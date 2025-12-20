import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Mic, Brain, Search, Sparkles, Zap, Shield, Clock, Users, 
  Calendar, TrendingUp, ChevronRight, Star, ArrowRight,
  MessageSquare, Lightbulb, Heart
} from "lucide-react";
import { motion } from "framer-motion";

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

export default function LandingPage() {
  const [, navigate] = useLocation();

  const features = [
    {
      icon: Mic,
      title: "Voice-First Capture",
      description: "Speak naturally to log memories. No typing, no forms—just talk and Helix handles the rest.",
      gradient: "from-violet-500 to-purple-600"
    },
    {
      icon: Brain,
      title: "AI-Powered Intelligence",
      description: "GPT automatically extracts topics, mood, people mentioned, and creates semantic meaning.",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: Search,
      title: "Semantic Search",
      description: "Ask questions naturally. Find 'that conversation about the project deadline' instantly.",
      gradient: "from-emerald-500 to-teal-500"
    },
    {
      icon: TrendingUp,
      title: "Pattern Insights",
      description: "Discover trends in your thoughts, moods, and activities with AI-powered analysis.",
      gradient: "from-orange-500 to-amber-500"
    },
    {
      icon: Users,
      title: "People Graph",
      description: "Track relationships and context about people in your life automatically.",
      gradient: "from-pink-500 to-rose-500"
    },
    {
      icon: Calendar,
      title: "Life Timeline",
      description: "Visualize your journey with a beautiful chronological view of your memories.",
      gradient: "from-indigo-500 to-violet-500"
    }
  ];

  const benefits = [
    {
      icon: Clock,
      stat: "30 sec",
      label: "Average capture time",
      description: "Log memories faster than ever"
    },
    {
      icon: Lightbulb,
      stat: "100%",
      label: "AI-organized",
      description: "Never manually tag again"
    },
    {
      icon: Heart,
      stat: "24/7",
      label: "Mood tracking",
      description: "Understand your patterns"
    }
  ];

  const testimonials = [
    {
      quote: "Helix changed how I capture ideas. I just speak and everything is organized perfectly.",
      author: "Alex Chen",
      role: "Product Designer"
    },
    {
      quote: "The semantic search is incredible. I can find any memory just by describing it naturally.",
      author: "Sarah Miller",
      role: "Writer & Content Creator"
    },
    {
      quote: "The mood insights helped me identify patterns I never noticed. Truly life-changing.",
      author: "James Park",
      role: "Entrepreneur"
    }
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-secondary/10 to-transparent pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-accent/10 via-transparent to-transparent pointer-events-none"></div>

      {/* Navigation */}
      <nav className="relative z-50 px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shadow-lg">
              <Brain className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <span className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Helix
            </span>
          </div>
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
            <motion.div variants={fadeIn} className="mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
                <Sparkles className="w-4 h-4" />
                AI-Powered Personal Memory Assistant
              </span>
            </motion.div>
            
            <motion.h1 
              variants={fadeIn}
              className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-6"
            >
              <span className="text-foreground">Capture Life with</span>
              <br />
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Just Your Voice
              </span>
            </motion.h1>
            
            <motion.p 
              variants={fadeIn}
              className="text-lg sm:text-xl lg:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              Speak naturally to log memories. Helix uses AI to organize, analyze, and help you rediscover your life's moments.
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
                onClick={() => navigate("/login")}
                className="text-lg px-8 py-6 border-2"
                data-testid="button-login-hero"
              >
                <MessageSquare className="w-5 h-5 mr-2" />
                See Demo
              </Button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div variants={fadeIn} className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Privacy-first design</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Powered by GPT-4</span>
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
              {/* Mock App UI */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-sm text-muted-foreground">Helix — Voice Log</span>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center animate-pulse">
                    <Mic className="w-12 h-12 lg:w-16 lg:h-16 text-white" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">Listening...</p>
                  <p className="text-sm text-muted-foreground mt-1">"Had a great meeting with Sarah about the new project timeline..."</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">Work</span>
                  <span className="px-3 py-1 rounded-full bg-secondary/20 text-secondary text-sm font-medium">Sarah</span>
                  <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-sm font-medium">Positive Mood</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
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
              Everything You Need to
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Remember</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful AI features that turn your spoken thoughts into organized, searchable memories.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
          >
            {features.map((feature, index) => (
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

      {/* Benefits Section */}
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
                Your Life,
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Beautifully Organized</span>
              </motion.h2>
              <motion.p variants={fadeIn} className="text-lg text-muted-foreground mb-10 leading-relaxed">
                Stop losing thoughts to forgotten notes. Helix turns every voice note into a searchable, 
                analyzable piece of your personal history.
              </motion.p>
              
              <motion.div variants={staggerContainer} className="grid gap-6">
                {benefits.map((benefit, index) => (
                  <motion.div 
                    key={index}
                    variants={fadeIn}
                    className="flex items-start gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-2xl font-bold text-foreground">{benefit.stat}</span>
                        <span className="text-sm font-medium text-muted-foreground">{benefit.label}</span>
                      </div>
                      <p className="text-muted-foreground">{benefit.description}</p>
                    </div>
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
              <div className="relative glass-card-strong rounded-2xl p-6 border border-white/20">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Morning Briefing Ready</p>
                      <p className="text-sm text-muted-foreground">3 focus areas for today</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/10 border border-secondary/20">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Positive Pattern Detected</p>
                      <p className="text-sm text-muted-foreground">Your mood improved 23% this week</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-accent/10 border border-accent/20">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">New Connection</p>
                      <p className="text-sm text-muted-foreground">Sarah mentioned 5 times this week</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
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
              Loved by
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Thoughtful People</span>
            </motion.h2>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-6 lg:gap-8"
          >
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                variants={fadeIn}
                className="glass-card p-6 lg:p-8 rounded-2xl border border-white/10"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-foreground mb-6 leading-relaxed">"{testimonial.quote}"</p>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.author}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              Ready to Remember
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent"> Everything?</span>
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
              Join thousands of people who are capturing their life's moments with Helix. 
              Start free, upgrade anytime.
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
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Helix
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2024 Helix. Your memories, beautifully organized.
          </p>
        </div>
      </footer>
    </div>
  );
}
