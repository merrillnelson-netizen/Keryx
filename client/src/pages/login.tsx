import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, Mic, Brain, Search, Sparkles, Zap, Shield } from "lucide-react";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(username, password);
      toast({ title: "Login successful!" });
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid username or password",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: Mic,
      title: "Voice-First Logging",
      description: "Speak naturally to capture memories. No structured forms or rigid templates."
    },
    {
      icon: Brain,
      title: "AI-Powered Processing",
      description: "GPT automatically extracts topics, metadata, and creates semantic embeddings."
    },
    {
      icon: Search,
      title: "Hybrid Search",
      description: "Find memories using natural language or filter by topics and dates."
    },
    {
      icon: Sparkles,
      title: "Smart Organization",
      description: "Auto-categorized memories with intelligent topic tagging for easy retrieval."
    }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 lg:p-8 bg-gradient-to-br from-background via-secondary/5 to-accent/10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-secondary/5 to-transparent"></div>
      
      <div className="w-full max-w-7xl relative z-10 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        {/* Landing Content - Left Side (shown second on mobile, first on desktop) */}
        <div className="space-y-8 animate-fade-in order-2 lg:order-1">
          {/* Hero Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shadow-xl flex-shrink-0">
                <Brain className="w-6 h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent break-words">
                  Helix
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">AI-Powered Memory Assistant</p>
              </div>
            </div>
            
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground leading-tight">
              Your Personal AI Memory Assistant
            </h2>
            
            <p className="text-base lg:text-lg text-muted-foreground leading-relaxed">
              Capture life's moments through voice, organize with AI, and find memories instantly with intelligent semantic search.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="glass-card p-5 rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tech Highlights */}
          <div className="flex flex-wrap gap-3">
            <div className="glass-card px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-foreground">OpenAI GPT-5</span>
            </div>
            <div className="glass-card px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
              <Shield className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-foreground">Secure & Private</span>
            </div>
            <div className="glass-card px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Semantic Search</span>
            </div>
          </div>
        </div>

        {/* Login Card - Right Side (shown first on mobile, second on desktop) */}
        <div className="animate-fade-in order-1 lg:order-2" style={{ animationDelay: "200ms" }}>
          <Card className="glass-card-strong border-white/20">
            <CardHeader className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shadow-lg">
                <LogIn className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Welcome Back
              </CardTitle>
              <CardDescription>Sign in to access your memories</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    data-testid="input-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="glass-card border-white/20"
                    autoComplete="username"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    data-testid="input-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="glass-card border-white/20"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  data-testid="button-login"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 glass-card text-muted-foreground">New to Helix?</span>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  data-testid="link-signup"
                  onClick={() => navigate("/signup")}
                  className="w-full glass-card border-white/20 hover:border-white/30 hover:bg-white/5"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create an Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
