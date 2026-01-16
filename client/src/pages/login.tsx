import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, ArrowLeft } from "lucide-react";
import { HelixLogo } from "@/components/helix-logo";

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
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid username or password",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 lg:p-8 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-secondary/10 to-transparent pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-accent/10 via-transparent to-transparent pointer-events-none"></div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-6">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to home</span>
            </div>
          </Link>
          
          <div className="flex justify-center mb-4">
            <HelixLogo size="lg" textClassName="text-2xl" />
          </div>
        </div>

        <Card className="glass-card-strong border-white/20">
          <CardHeader className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
              <LogIn className="w-7 h-7 text-white" />
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
                  className="border-white/20"
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
                  className="border-white/20"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button
                type="submit"
                data-testid="button-login"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
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
                  <span className="px-2 bg-card text-muted-foreground">New to Helix?</span>
                </div>
              </div>
              
              <Button
                variant="outline"
                data-testid="link-signup"
                onClick={() => navigate("/signup")}
                className="w-full border-white/20 hover:border-white/30 hover:bg-white/5"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Create an Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
