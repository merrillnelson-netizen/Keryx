import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Template } from "@shared/schema";

export default function TestVoiceButton() {
  const queryClient = useQueryClient();
  const { data: activeTemplate } = useQuery<Template>({
    queryKey: ["/api/templates/active"],
  });

  const testLogMutation = useMutation({
    mutationFn: (logEntry: any) => apiRequest("POST", "/api/logs", logEntry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
    },
  });

  const testVoiceToLog = async () => {
    if (!activeTemplate) {
      alert("No active template found!");
      return;
    }

    const testCommand = "Round 2 Table 3 Game 1 - Mike racked, Sarah broke";
    const testData = {
      round: 2,
      table: 3,
      game: 1,
      actions: [
        { player: "Mike", action: "racked" },
        { player: "Sarah", action: "broke" }
      ],
      type: "billiards_log"
    };

    try {
      await testLogMutation.mutateAsync({
        templateId: activeTemplate.id,
        rawCommand: testCommand,
        parsedData: testData,
      });
      alert("Test log entry created successfully! Check the History page.");
    } catch (error) {
      console.error("Test failed:", error);
      alert("Test failed. Check console for details.");
    }
  };

  return (
    <Button 
      onClick={testVoiceToLog} 
      className="bg-purple-600 hover:bg-purple-700 text-white"
      disabled={testLogMutation.isPending}
    >
      <span className="material-icons mr-2">bug_report</span>
      {testLogMutation.isPending ? "Testing..." : "Test Create Log Entry"}
    </Button>
  );
}