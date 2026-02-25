import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { KeryxLogoIcon } from "@/components/keryx-logo";
import { Scroll, MessageCircle, Globe, Users } from "lucide-react";

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
                <em>Keryx,</em> derived from the ancient Greek term for "herald" or "messenger," encapsulates the 
                timeless essence of communication and connection. In our fast-paced world, where information flows 
                at lightning speed, Keryx stands as a modern herald, bridging gaps and fostering relationships 
                among its users.
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
                In ancient Greece, messengers were the lifeblood of communication, delivering vital news and 
                announcements across city-states. This role is often associated with Hermes, the Greek god of 
                speed and eloquence, who symbolizes the significance of swift and clear communication. Just as 
                Hermes carried messages across great distances, Keryx facilitates the seamless exchange of ideas 
                and information in our interconnected world.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-amber-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">A Trusted Companion</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Keryx is not just a tool; it is a trusted companion that enhances interactions, ensuring messages 
                are conveyed accurately and swiftly. In a world filled with noise and distractions, it cuts through 
                the clutter, allowing users to connect more meaningfully.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-amber-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Cultural Legacy</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Like the ancient keryx, the Keryx app fosters understanding and collaboration among diverse groups, 
                reminding us of the power of shared knowledge and experiences. It embodies the spirit of community, 
                where every message sent is a step toward greater connection. The legacy of Keryx urges us to embrace 
                the art of communication — championing clarity, empathy, and connection, ensuring that every message 
                resonates with purpose and intention.
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
