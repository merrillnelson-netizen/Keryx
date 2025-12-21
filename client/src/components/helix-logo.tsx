import { cn } from "@/lib/utils";

interface HelixLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

const sizeMap = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

function DNAHelixSVG({ size = 40 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Helix DNA Logo"
    >
      <defs>
        <linearGradient id="helixGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="helixGradient2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      
      {/* Left helix strand */}
      <path
        d="M20 8 C8 16, 8 24, 20 32 C32 40, 32 48, 20 56"
        stroke="url(#helixGradient)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Right helix strand */}
      <path
        d="M44 8 C56 16, 56 24, 44 32 C32 40, 32 48, 44 56"
        stroke="url(#helixGradient2)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Connecting rungs */}
      <line x1="20" y1="14" x2="44" y2="14" stroke="url(#helixGradient)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <line x1="14" y1="24" x2="50" y2="24" stroke="url(#helixGradient)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      <line x1="20" y1="32" x2="44" y2="32" stroke="url(#helixGradient2)" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      <line x1="14" y1="40" x2="50" y2="40" stroke="url(#helixGradient2)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      <line x1="20" y1="50" x2="44" y2="50" stroke="url(#helixGradient)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function HelixLogo({ 
  size = "md", 
  className,
  showText = true,
  textClassName
}: HelixLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex-shrink-0">
        <DNAHelixSVG size={sizeMap[size]} />
      </div>
      {showText && (
        <span className={cn(
          "font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent",
          textClassName || "text-xl lg:text-2xl"
        )}>
          Helix
        </span>
      )}
    </div>
  );
}

export function HelixLogoIcon({ 
  size = "md", 
  className 
}: Omit<HelixLogoProps, "showText" | "textClassName">) {
  return (
    <div className={cn("flex-shrink-0", className)}>
      <DNAHelixSVG size={sizeMap[size]} />
    </div>
  );
}

export default HelixLogo;
