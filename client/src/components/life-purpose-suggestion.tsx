import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Compass, ExternalLink, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LifePurposeSuggestionProps {
  onDismiss: () => void;
}

export function LifePurposeSuggestion({ onDismiss }: LifePurposeSuggestionProps) {
  const [dismissed, setDismissed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(onDismiss, 300);
  };

  const handleExplore = () => {
    window.open("https://life-purpose-merrillnelson.replit.app/", "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="mt-4 relative"
        >
          <div className="glass-card p-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-transparent to-cyan-500/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="absolute right-2 top-2 p-1 h-auto rounded-full hover:bg-white/10"
            >
              <X className="w-4 h-4 text-muted-foreground" />
              <span className="sr-only">Dismiss</span>
            </Button>

            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-cyan-500/20 flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground mb-1">
                  Exploring life's bigger questions?
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  The makers of Keryx created something that might help you discover your life's purpose.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExplore}
                  className="rounded-full border-amber-500/30 hover:bg-amber-500/10 hover:border-amber-500/50 text-xs"
                >
                  <span>Discover Your Life Purpose</span>
                  <ExternalLink className="w-3 h-3 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LifePurposeSuggestion;
