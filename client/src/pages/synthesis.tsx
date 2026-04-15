import AppLayout from "@/components/app-layout";
import SynthesisContent from "@/components/synthesis-content";

export default function SynthesisPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col" style={{ height: "calc(100vh - 8rem)" }}>
        <div className="mb-4 flex-shrink-0">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
            AI Thematic Synthesis
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Deep analysis of patterns and themes in your memories
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <SynthesisContent />
        </div>
      </div>
    </AppLayout>
  );
}
