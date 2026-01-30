import { cn } from "@/lib/utils";

interface KeryxLogoProps {
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
  const uniqueId = `keryx-${Math.random().toString(36).substr(2, 9)}`;
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Keryx Logo"
    >
      <defs>
        <linearGradient id={`${uniqueId}-grad1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-grad2`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <filter id={`${uniqueId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <g filter={`url(#${uniqueId}-glow)`}>
        {/* Left helix strand - curves to form left side of H */}
        <path
          d="M16 6 C6 14, 6 22, 16 30 C26 38, 26 48, 16 58"
          stroke={`url(#${uniqueId}-grad1)`}
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Right helix strand - curves to form right side of H */}
        <path
          d="M48 6 C58 14, 58 22, 48 30 C38 38, 38 48, 48 58"
          stroke={`url(#${uniqueId}-grad2)`}
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Center horizontal bar - the crossbar of the H */}
        <line 
          x1="16" y1="32" x2="48" y2="32" 
          stroke={`url(#${uniqueId}-grad1)`} 
          strokeWidth="4" 
          strokeLinecap="round" 
        />
        
        {/* DNA connecting rungs above center */}
        <line x1="14" y1="18" x2="50" y2="18" stroke={`url(#${uniqueId}-grad1)`} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        
        {/* DNA connecting rungs below center */}
        <line x1="14" y1="46" x2="50" y2="46" stroke={`url(#${uniqueId}-grad2)`} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        
        {/* Accent dots at the helix crossings */}
        <circle cx="16" cy="30" r="3" fill={`url(#${uniqueId}-grad1)`} opacity="0.8" />
        <circle cx="48" cy="30" r="3" fill={`url(#${uniqueId}-grad2)`} opacity="0.8" />
      </g>
    </svg>
  );
}

export function KeryxLogo({ 
  size = "md", 
  className,
  showText = true,
  textClassName
}: KeryxLogoProps) {
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
          Keryx
        </span>
      )}
    </div>
  );
}

export function KeryxLogoIcon({ 
  size = "md", 
  className 
}: Omit<KeryxLogoProps, "showText" | "textClassName">) {
  return (
    <div className={cn("flex-shrink-0", className)}>
      <DNAHelixSVG size={sizeMap[size]} />
    </div>
  );
}

export { KeryxLogo as HelixLogo, KeryxLogoIcon as HelixLogoIcon };
export default KeryxLogo;
