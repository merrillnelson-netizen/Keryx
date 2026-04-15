import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { Settings, ProfileObservation } from "@shared/schema";
import {
  UserCircle, Sparkles, Check, X, RefreshCw, Loader2, Save,
  Brain, ChevronDown, ChevronUp, RotateCcw, PenLine,
} from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  habits:        "bg-blue-500/20 text-blue-400 border-blue-500/30",
  relationships: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  patterns:      "bg-purple-500/20 text-purple-400 border-purple-500/30",
  interests:     "bg-green-500/20 text-green-400 border-green-500/30",
  goals:         "bg-orange-500/20 text-orange-400 border-orange-500/30",
  communication: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

const USER_WORD_COLOR = "bg-amber-500/20 text-amber-400 border-amber-500/30";
const USER_WORD_DOT   = "bg-amber-500/40 border-amber-500/60";

function parseUserWords(text: string): string[] {
  return text
    .split(/\n+/)
    .map(line => line.replace(/^[-•*·\s]+/, '').trim())
    .filter(line => line.length > 3);
}

function ObservationCard({ obs, onConfirm, onDismiss, isPending }: {
  obs: ProfileObservation;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const colorClass = CATEGORY_COLORS[obs.category] ?? "bg-muted/20 text-muted-foreground border-muted/30";
  return (
    <div className="glass-card p-4 rounded-xl border border-white/10 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground leading-snug">{obs.observation}</p>
          {obs.evidenceSummary && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{obs.evidenceSummary}</p>
          )}
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${colorClass}`}>
          {obs.category}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Confidence</span>
            <span className="text-xs text-muted-foreground">{Math.round((obs.confidence ?? 0.7) * 100)}%</span>
          </div>
          <Progress value={(obs.confidence ?? 0.7) * 100} className="h-1.5" />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={onDismiss}
            disabled={isPending}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Dismiss
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30"
            variant="outline"
            onClick={onConfirm}
            disabled={isPending}
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

type CombinedItem =
  | { kind: 'ai'; obs: ProfileObservation }
  | { kind: 'user'; text: string; key: string };

function CombinedProfileList({
  confirmed,
  userWords,
  onAiRemove,
  onAiUndo,
  onUserRemove,
  onUserMoveToWords,
  aiPending,
  userPending,
}: {
  confirmed: ProfileObservation[];
  userWords: string[];
  onAiRemove: (id: string) => void;
  onAiUndo: (id: string) => void;
  onUserRemove: (text: string) => void;
  aiPending: boolean;
  userPending: boolean;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const items: CombinedItem[] = [
    ...userWords.map(t => ({ kind: 'user' as const, text: t, key: `user_${t}` })),
    ...confirmed.map(o => ({ kind: 'ai' as const, obs: o })),
  ];

  const totalCount = items.length;
  if (totalCount === 0) return null;

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Check className="w-4 h-4 text-green-400" />
          Active Profile Context
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
            {totalCount}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Everything here is fed into Keryx's AI context.{" "}
          <span className="text-amber-400/80">Amber</span> = your own words.{" "}
          Colored dots = AI observations. Tap any item to manage it.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-white/5">
          {items.map(item => {
            const key = item.kind === 'user' ? item.key : item.obs.id;
            const isExpanded = expandedKey === key;

            if (item.kind === 'user') {
              return (
                <div key={key} className="px-4 py-0">
                  <button
                    className="w-full flex items-start gap-3 py-3 text-left"
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                  >
                    <span className={`mt-1 shrink-0 w-2 h-2 rounded-full border ${USER_WORD_DOT}`} />
                    <span className="flex-1 text-sm text-foreground leading-snug">{item.text}</span>
                    <span className="shrink-0 text-muted-foreground mt-0.5">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="pb-3 space-y-3">
                      <Badge variant="outline" className={`text-xs ${USER_WORD_COLOR}`}>
                        <PenLine className="w-2.5 h-2.5 mr-1" />
                        Your words
                      </Badge>
                      <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-amber-500/20 pl-3">
                        You wrote this yourself. It is always treated as confirmed and used by Keryx when
                        generating actions and responses.
                      </p>
                      <div className="flex gap-2 pt-1 flex-wrap">
                        <p className="text-xs text-muted-foreground/60 w-full">
                          Edit this text in the "Your Words" section above, or remove it entirely below.
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2.5 text-xs gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          disabled={userPending}
                          onClick={() => { onUserRemove(item.text); setExpandedKey(null); }}
                        >
                          <X className="w-3 h-3" />
                          Remove from profile
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const colorClass = CATEGORY_COLORS[item.obs.category] ?? "bg-muted/20 text-muted-foreground border-muted/30";
            const dotClass   = colorClass.replace('bg-', 'bg-').replace('/20', '/40').replace('border-', 'border-');

            return (
              <div key={key} className="px-4 py-0">
                <button
                  className="w-full flex items-start gap-3 py-3 text-left"
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                >
                  <span className={`mt-1 shrink-0 w-2 h-2 rounded-full border ${dotClass}`} />
                  <span className="flex-1 text-sm text-foreground leading-snug">{item.obs.observation}</span>
                  <span className="shrink-0 text-muted-foreground mt-0.5">
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>
                {isExpanded && (
                  <div className="pb-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${colorClass}`}>
                        {item.obs.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {Math.round((item.obs.confidence ?? 0.7) * 100)}% confidence
                      </span>
                    </div>
                    {item.obs.evidenceSummary && (
                      <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-white/10 pl-3">
                        {item.obs.evidenceSummary}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                        disabled={aiPending}
                        onClick={() => { onAiUndo(item.obs.id); setExpandedKey(null); }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Move back to pending
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        disabled={aiPending}
                        onClick={() => { onAiRemove(item.obs.id); setExpandedKey(null); }}
                      >
                        <X className="w-3 h-3" />
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userProfile, setUserProfile] = useState("");

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    staleTime: 60_000,
  });

  const { data: observations = [], isLoading: obsLoading } = useQuery<ProfileObservation[]>({
    queryKey: ["/api/profile/observations"],
    staleTime: 30_000,
  });

  useEffect(() => {
    if (settings?.userProfile !== undefined) {
      setUserProfile(settings.userProfile ?? "");
    }
  }, [settings?.userProfile]);

  const pending   = observations.filter(o => o.status === 'pending');
  const confirmed = observations.filter(o => o.status === 'confirmed');
  const userWords = parseUserWords(settings?.userProfile ?? "");

  const saveProfileMutation = useMutation({
    mutationFn: (text: string) => apiRequest("PUT", "/api/settings", { userProfile: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Profile saved" });
    },
    onError: () => toast({ title: "Failed to save profile", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'confirmed' | 'denied' | 'pending' }) =>
      apiRequest("PATCH", `/api/profile/observations/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/observations"] });
    },
    onError: () => toast({ title: "Failed to update observation", variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/profile/observations/generate", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/profile/observations"] });
      toast({
        title: data.generated > 0
          ? `Generated ${data.generated} new observation${data.generated !== 1 ? 's' : ''}`
          : "No new observations — check back after logging more memories",
      });
    },
    onError: () => toast({ title: "Failed to generate observations", variant: "destructive" }),
  });

  function handleUserRemove(text: string) {
    const current = settings?.userProfile ?? userProfile;
    const remaining = parseUserWords(current).filter(w => w !== text).join('\n');
    setUserProfile(remaining);
    saveProfileMutation.mutate(remaining);
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in max-w-2xl">
        {/* Header */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">My Profile</h2>
              <p className="text-sm text-muted-foreground">How Keryx knows you</p>
            </div>
          </div>
        </div>

        {/* Your Words — textarea for adding/editing */}
        <Card className="glass-card border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine className="w-4 h-4 text-amber-400" />
              Your Words
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              One statement per line. Each line becomes its own entry in your Active Profile Context below.
              The AI uses these directly when suggesting actions.
            </p>
            <Textarea
              value={userProfile}
              onChange={(e) => setUserProfile(e.target.value)}
              placeholder={`Examples:\nI text friends and family — never email them\nI prefer email for business contacts\nI work in Mountain Time and keep evenings free\nI'm rebuilding track confidence on my KTM`}
              className="min-h-[120px] glass-card border-white/20 text-sm resize-none"
            />
            <Button
              onClick={() => saveProfileMutation.mutate(userProfile)}
              disabled={saveProfileMutation.isPending}
              size="sm"
            >
              {saveProfileMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </CardContent>
        </Card>

        {/* What Keryx Has Noticed — pending only */}
        <Card className="glass-card border-white/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="w-4 h-4 text-purple-400" />
                What Keryx Has Noticed
                {pending.length > 0 && (
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                    {pending.length} pending
                  </Badge>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Generate
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {obsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : pending.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">No pending observations.</p>
                <p className="text-xs text-muted-foreground/60">
                  Keryx generates these automatically after your morning briefing, or tap Generate above.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map(obs => (
                  <ObservationCard
                    key={obs.id}
                    obs={obs}
                    onConfirm={() => reviewMutation.mutate({ id: obs.id, status: 'confirmed' })}
                    onDismiss={() => reviewMutation.mutate({ id: obs.id, status: 'denied' })}
                    isPending={reviewMutation.isPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unified Active Profile Context */}
        {(confirmed.length > 0 || userWords.length > 0) && (
          <CombinedProfileList
            confirmed={confirmed}
            userWords={userWords}
            onAiRemove={(id) => reviewMutation.mutate({ id, status: 'denied' })}
            onAiUndo={(id) => reviewMutation.mutate({ id, status: 'pending' })}
            onUserRemove={handleUserRemove}
            aiPending={reviewMutation.isPending}
            userPending={saveProfileMutation.isPending}
          />
        )}
      </div>
    </AppLayout>
  );
}
