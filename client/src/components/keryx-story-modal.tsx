import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeryxLogoIcon } from "@/components/keryx-logo";
import { Scroll, MessageCircle, Globe, X } from "lucide-react";

interface KeryxStoryModalProps {
  children: React.ReactNode;
}

export function KeryxStoryModal({ children }: KeryxStoryModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-lg">
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg glass-card-strong border-white/20 z-[200] max-h-[90vh] overflow-y-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/10 z-10"
        >
          <X className="w-5 h-5" />
          <span className="sr-only">Close</span>
        </Button>
        <DialogHeader className="text-center pb-4 border-b border-white/10">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-teal-500/20 to-amber-500/20 ring-2 ring-white/10">
              <KeryxLogoIcon size="xl" />
            </div>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-teal-500 to-amber-500 bg-clip-text text-transparent">
              The Story of Keryx
            </DialogTitle>
            <DialogDescription className="sr-only">
              Learn about the ancient Greek origins of the name Keryx and its connection to Hermes, the messenger god.
            </DialogDescription>
          </div>
        </DialogHeader>
        
        <div className="py-6 space-y-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center">
              <Scroll className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Ancient Origins</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Keryx is named after the ancient Greek concept of a "keryx," meaning "herald" or "messenger." 
                In ancient Greece, messengers were crucial for communication, conveying important news and 
                announcements across cities.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-amber-500/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-teal-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Divine Connection</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This role is often associated with Hermes, the Greek god known for his speed and eloquence, 
                symbolizing the significance of communication. Keryx served as a vital link in society, 
                transmitting messages during times of war, diplomacy, or significant events.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-amber-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Modern Legacy</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The messenger represents the bridging of gaps between people, ideas, and cultures, 
                aligning with our goals of fostering connection and sharing information. The legacy 
                of Keryx reminds us of the ongoing importance of effective communication in our 
                interconnected world.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <p className="text-center text-xs text-muted-foreground italic">
            "Kinetic Enterprise & Resource Yielding X-system"
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeryxStoryModal;
