import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Share, Plus } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

interface PwaInstallPromptProps {
  variant?: "landing" | "banner" | "settings";
}

export function PwaInstallPrompt({ variant = "banner" }: PwaInstallPromptProps) {
  const { canInstall, isInstalled, showIosInstructions, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled || dismissed) return null;

  if (variant === "settings") {
    if (!canInstall && !showIosInstructions) return null;

    return (
      <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">Install Keryx App</p>
            <p className="text-xs text-muted-foreground">Add to your home screen for the best experience</p>
          </div>
        </div>
        {canInstall ? (
          <Button size="sm" onClick={promptInstall} className="bg-gradient-to-r from-primary to-secondary text-white">
            Install
          </Button>
        ) : showIosInstructions ? (
          <Button size="sm" variant="outline" onClick={() => setShowIosGuide(!showIosGuide)}>
            How to Install
          </Button>
        ) : null}
        {showIosGuide && (
          <div className="absolute mt-20 right-4 z-50 bg-popover border border-border rounded-xl p-4 shadow-xl max-w-xs">
            <p className="text-sm text-foreground font-medium mb-2">Install on iOS:</p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Share className="w-4 h-4 text-primary shrink-0" />
                <span>Tap the Share button in Safari</span>
              </div>
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary shrink-0" />
                <span>Scroll down and tap "Add to Home Screen"</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (variant === "landing") {
    if (!canInstall && !showIosInstructions) return null;

    return (
      <div className="inline-flex items-center gap-2">
        {canInstall ? (
          <Button
            size="lg"
            variant="outline"
            onClick={promptInstall}
            className="text-lg px-8 py-6 border-white/20 hover:bg-white/5 gap-2"
          >
            <Download className="w-5 h-5" />
            Install App
          </Button>
        ) : showIosInstructions ? (
          <div className="relative">
            <Button
              size="lg"
              variant="outline"
              onClick={() => setShowIosGuide(!showIosGuide)}
              className="text-lg px-8 py-6 border-white/20 hover:bg-white/5 gap-2"
            >
              <Download className="w-5 h-5" />
              Install App
            </Button>
            {showIosGuide && (
              <div className="absolute top-full mt-3 left-0 z-50 bg-popover border border-border rounded-xl p-5 shadow-xl min-w-[280px]">
                <button onClick={() => setShowIosGuide(false)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
                <p className="text-sm text-foreground font-medium mb-3">Install Keryx on iOS:</p>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">1</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Tap the</span>
                      <Share className="w-4 h-4 text-primary inline" />
                      <span>Share button</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">2</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Tap</span>
                      <Plus className="w-4 h-4 text-primary inline" />
                      <span>"Add to Home Screen"</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (!canInstall && !showIosInstructions) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-popover/95 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-2xl">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">Install Keryx</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Add to your home screen for a native app experience
            </p>
            {canInstall ? (
              <Button
                size="sm"
                onClick={promptInstall}
                className="w-full bg-gradient-to-r from-primary to-secondary text-white"
              >
                Install Now
              </Button>
            ) : showIosInstructions ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Share className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>Tap Share in Safari</span>
                </div>
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>"Add to Home Screen"</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
