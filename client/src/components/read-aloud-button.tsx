import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReadAloudButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "ghost" | "outline" | "default" | "secondary";
}

export function ReadAloudButton({
  text,
  label = "Read This",
  className,
  size = "sm",
  variant = "ghost",
}: ReadAloudButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
    };
  }, []);

  const handleClick = useCallback(() => {
    if (!isSupported) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [text, isSpeaking, isSupported]);

  if (!isSupported) return null;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn("gap-1.5 text-xs", className)}
      title={isSpeaking ? "Stop reading" : "Read this aloud"}
    >
      {isSpeaking ? (
        <Square className="w-3 h-3 fill-current" />
      ) : (
        <Volume2 className="w-3.5 h-3.5" />
      )}
      {isSpeaking ? "Stop" : label}
    </Button>
  );
}
