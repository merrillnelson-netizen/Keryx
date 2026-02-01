import { cn } from "@/lib/utils";
import keryxLogoImage from "@/assets/keryx-logo.png";

interface KeryxLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "hero";
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

const sizeMap = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
  "2xl": 96,
  hero: 140,
};

export function KeryxLogo({ 
  size = "md", 
  className,
  showText = true,
  textClassName
}: KeryxLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex-shrink-0">
        <img 
          src={keryxLogoImage} 
          alt="Keryx Logo" 
          width={sizeMap[size]} 
          height={sizeMap[size]}
          className="object-contain"
        />
      </div>
      {showText && (
        <span className={cn(
          "font-bold bg-gradient-to-r from-cyan-400 via-teal-500 to-amber-500 bg-clip-text text-transparent",
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
      <img 
        src={keryxLogoImage} 
        alt="Keryx Logo" 
        width={sizeMap[size]} 
        height={sizeMap[size]}
        className="object-contain"
      />
    </div>
  );
}

export { KeryxLogo as HelixLogo, KeryxLogoIcon as HelixLogoIcon };
export default KeryxLogo;
