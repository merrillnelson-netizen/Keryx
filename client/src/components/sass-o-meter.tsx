import { useState, useEffect } from "react";
import { motion, animate } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock } from "lucide-react";

interface SassOMeterProps {
  value: number;
  onChange: (value: number) => void;
  isMuted: boolean;
  onMuteChange: (muted: boolean) => void;
  tier: "free" | "pro" | "life_os";
}

const SASS_LABELS = [
  { level: 0, label: "Silent", pct: 0 },
  { level: 25, label: "Strictly Business", pct: 25 },
  { level: 50, label: "Opinionated Peer", pct: 50 },
  { level: 75, label: "Roast Master", pct: 75 },
  { level: 100, label: "Full Max Chaos", pct: 100 },
];

const TIER_CAPS: Record<string, number> = {
  free: 25,
  pro: 75,
  life_os: 100,
};

function getTierCap(tier: string): number {
  return TIER_CAPS[tier] ?? 25;
}

function getLabelForValue(value: number): string {
  if (value === 0) return "Silent / Muted";
  if (value <= 25) return "Strictly Business";
  if (value <= 50) return "Opinionated Peer";
  if (value <= 75) return "Roast Master";
  return "Full Maximum Chaos Mode";
}

function getThumbColor(value: number): string {
  if (value <= 25) return "#3b82f6";
  if (value <= 50) return "#22c55e";
  if (value <= 75) return "#f97316";
  return "#a855f7";
}

export function SassOMeter({ value, onChange, isMuted, onMuteChange, tier }: SassOMeterProps) {
  const cap = getTierCap(tier);
  const displayValue = isMuted ? 0 : value;
  const isLocked = (v: number) => v > cap;
  const thumbColor = getThumbColor(displayValue);
  const currentLabel = getLabelForValue(displayValue);

  const [visualPos, setVisualPos] = useState(displayValue);
  const [isBouncing, setIsBouncing] = useState(false);

  useEffect(() => {
    if (!isBouncing) {
      setVisualPos(displayValue);
    }
  }, [displayValue, isBouncing]);

  const upgradeTooltip =
    tier === "free"
      ? "Upgrade to Pro to unlock up to 75% sass"
      : tier === "pro"
      ? "Upgrade to Life OS for full 100% Maximum Chaos Mode"
      : null;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseInt(e.target.value, 10);
    if (newVal > cap) {
      if (isBouncing) return;
      setIsBouncing(true);
      setVisualPos(newVal);
      setTimeout(() => {
        setVisualPos(cap);
        setTimeout(() => setIsBouncing(false), 500);
      }, 120);
      return;
    }
    onChange(newVal);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Professional Mode</Label>
          <p className="text-xs text-muted-foreground">
            Mutes personality entirely — Keryx becomes a straight-facts assistant.
          </p>
        </div>
        <Switch checked={isMuted} onCheckedChange={onMuteChange} />
      </div>

      <div className={`space-y-3 transition-opacity duration-200 ${isMuted ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Keryx Personality</Label>
          <motion.span
            key={currentLabel}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-xs font-semibold text-right"
            style={{ color: thumbColor }}
          >
            {currentLabel}
          </motion.span>
        </div>

        <div className="relative">
          <div
            className="h-3 rounded-full w-full relative overflow-hidden"
            style={{
              background:
                "linear-gradient(to right, #3b82f6 0%, #22c55e 25%, #facc15 50%, #f97316 75%, #a855f7 100%)",
            }}
          >
            {cap < 100 && (
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/50 flex items-center justify-center"
                style={{ left: `${cap}%` }}
              >
                <Lock className="w-2.5 h-2.5 text-white/70 mx-auto" />
              </div>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={displayValue}
            onChange={handleSliderChange}
            disabled={isMuted}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-3"
            style={{ top: 0 }}
          />
          <motion.div
            className="absolute top-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg -translate-y-1/2 -translate-x-1/2 pointer-events-none"
            style={{ top: "50%" }}
            animate={{
              left: `${visualPos}%`,
              backgroundColor: thumbColor,
            }}
            transition={
              isBouncing && visualPos === cap
                ? { type: "spring", stiffness: 500, damping: 18 }
                : isBouncing
                ? { duration: 0.1, ease: "easeOut" }
                : { type: "spring", stiffness: 300, damping: 30 }
            }
          />
        </div>

        {isBouncing && upgradeTooltip && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="text-center"
          >
            <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 inline-block">
              🔒 {upgradeTooltip}
            </span>
          </motion.div>
        )}

        <div className="flex justify-between relative">
          {SASS_LABELS.map(({ pct, label }) => {
            const locked = isLocked(pct);
            return (
              <div key={pct} className="flex flex-col items-center" style={{ width: "20%" }}>
                {locked && upgradeTooltip ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-center cursor-not-allowed">
                          <span className="text-[9px] text-center leading-tight text-muted-foreground/40 line-through">
                            {label}
                          </span>
                          <Lock className="w-2.5 h-2.5 text-muted-foreground/40 mt-0.5" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">
                        {upgradeTooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span
                    className={`text-[9px] text-center leading-tight ${
                      pct === displayValue
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center">
          <span className="text-xs text-muted-foreground">
            Sass level: <span className="font-mono font-bold">{displayValue}%</span>
          </span>
        </div>
      </div>
    </div>
  );
}
