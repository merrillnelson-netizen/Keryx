import helixLogoPath from "@assets/image_304fdf1b-845d-4504-acbd-0116ac79ca74_1766278006373.jpg";
import { cn } from "@/lib/utils";

interface HelixLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-10 h-10 lg:w-12 lg:h-12",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

export function HelixLogo({ 
  size = "md", 
  className,
  showText = true,
  textClassName
}: HelixLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div 
        className={cn(
          "rounded-xl overflow-hidden shadow-lg flex-shrink-0",
          sizeMap[size]
        )}
        style={{
          background: "linear-gradient(135deg, transparent 0%, transparent 100%)"
        }}
      >
        <img 
          src={helixLogoPath} 
          alt="Helix Logo" 
          className="w-full h-full object-cover object-top"
          style={{
            objectPosition: "0% 0%",
            transform: "scale(2)",
            transformOrigin: "0 0"
          }}
        />
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
    <div 
      className={cn(
        "rounded-xl overflow-hidden shadow-lg flex-shrink-0",
        sizeMap[size],
        className
      )}
    >
      <img 
        src={helixLogoPath} 
        alt="Helix" 
        className="w-full h-full object-cover object-top"
        style={{
          objectPosition: "0% 0%",
          transform: "scale(2)",
          transformOrigin: "0 0"
        }}
      />
    </div>
  );
}

export default HelixLogo;
