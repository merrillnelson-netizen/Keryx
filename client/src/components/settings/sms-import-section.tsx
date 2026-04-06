import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, Bot, Smartphone } from "lucide-react";

interface MessageImportRecord {
  id: string;
  batchId: string;
  source: string;
  fileName: string | null;
  totalMessages: number | null;
  newMessages: number | null;
  duplicateMessages: number | null;
  aiProcessedCount: number | null;
  status: string;
  errorMessage: string | null;
  importedAt: string;
  completedAt: string | null;
}

interface MessageStats {
  totalConversations: number;
  totalMessages: number;
}

interface ProcessingStatus {
  total: number;
  processed: number;
  unprocessed: number;
}

export function SmsImportSection() {
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: imports = [] } = useQuery<MessageImportRecord[]>({
    queryKey: ["/api/messages/imports"],
    staleTime: 1000 * 60 * 2,
  });

  const { data: stats } = useQuery<MessageStats>({
    queryKey: ["/api/messages/stats"],
    staleTime: 1000 * 60 * 2,
  });

  const { data: processingStatus } = useQuery<ProcessingStatus>({
    queryKey: ["/api/messages/processing-status"],
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      return (data && data.unprocessed > 0) || isProcessingAi ? 5000 : false;
    },
    enabled: (stats?.totalMessages ?? 0) > 0,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress("Reading file...");

    try {
      let fileContent = '';

      if (file.name.endsWith('.zip')) {
        setImportProgress("Extracting ZIP file...");
        const { BlobReader, ZipReader, TextWriter } = await import('@zip.js/zip.js');
        const reader = new ZipReader(new BlobReader(file));
        const entries = await reader.getEntries();
        const dataEntry = entries.find((entry: any) =>
          !entry.directory && (
            entry.filename.endsWith('.ndjson') ||
            entry.filename.endsWith('.json') ||
            entry.filename.endsWith('.txt')
          )
        ) || entries.find((entry: any) => !entry.directory);
        if (!dataEntry) {
          throw new Error("No data file found in ZIP archive. Files found: " + entries.map((e: any) => e.filename).join(', '));
        }
        if ('getData' in dataEntry && typeof dataEntry.getData === 'function') {
          fileContent = await (dataEntry as any).getData(new TextWriter());
        }
        if (!fileContent) {
          throw new Error("Could not extract file content from ZIP. File: " + (dataEntry as any).filename);
        }
        await reader.close();
      } else {
        fileContent = await file.text();
      }

      if (!fileContent || fileContent.trim().length === 0) {
        throw new Error("File appears to be empty. Please check your export file.");
      }

      setImportProgress("Uploading and importing messages...");

      const response = await apiRequest("POST", "/api/messages/import", {
        fileContent,
        fileName: file.name,
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Import Complete",
          description: `${result.newMessages} new messages imported from ${result.conversations} conversations. ${result.duplicates} duplicates skipped.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/imports"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      } else {
        throw new Error(result.message || "Import failed");
      }
    } catch (error: any) {
      let errorMsg = error.message || "Failed to import messages";
      const jsonMatch = errorMsg.match(/\{.*"message"\s*:\s*"([^"]+)"/);
      if (jsonMatch) {
        errorMsg = jsonMatch[1];
      }
      if (errorMsg.includes('413') || errorMsg.includes('too large') || errorMsg.includes('payload')) {
        errorMsg = "File is too large. Try exporting a smaller date range from the SMS app.";
      } else if (errorMsg.includes('timeout') || errorMsg.includes('network') || errorMsg.includes('Failed to fetch')) {
        errorMsg = "Upload timed out — the file may be too large or your connection dropped. Try a smaller export.";
      }
      toast({
        title: "Import Failed",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setImportProgress("");
      e.target.value = '';
    }
  };

  const handleProcessAi = async () => {
    setIsProcessingAi(true);
    try {
      const response = await apiRequest("POST", "/api/messages/process-ai?limit=50");
      const result = await response.json();
      const remaining = result.remaining || 0;
      toast({
        title: remaining > 0 ? "AI Processing Started" : "AI Processing Complete",
        description: remaining > 0
          ? `Processed ${result.processed} messages. ${remaining} remaining — processing continues in background.`
          : `Processed ${result.processed} messages with AI analysis.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/processing-status"] });
    } catch (error: any) {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to process messages",
        variant: "destructive",
      });
    } finally {
      setIsProcessingAi(false);
    }
  };

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-green-500" />
          Text Message Import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Import your text messages from the <span className="font-medium text-foreground">SMS Import / Export</span> Android app.
          Keryx will analyze your conversations for insights, people tracking, and AI briefings.
        </p>

        {stats && stats.totalMessages > 0 && (
          <div className="space-y-3">
            <div className="flex gap-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{stats.totalConversations}</p>
                <p className="text-xs text-muted-foreground">Conversations</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{stats.totalMessages.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Messages</p>
              </div>
              {processingStatus && (
                <div className="text-center">
                  <p className="text-lg font-bold text-green-400">
                    {processingStatus.unprocessed === 0 ? '100%' : `${Math.round((processingStatus.processed / processingStatus.total) * 100)}%`}
                  </p>
                  <p className="text-xs text-muted-foreground">AI Analyzed</p>
                </div>
              )}
            </div>

            {processingStatus && processingStatus.unprocessed > 0 && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  <span className="text-xs font-medium text-foreground">
                    AI Processing: {processingStatus.processed} / {processingStatus.total}
                  </span>
                </div>
                <Progress
                  value={(processingStatus.processed / processingStatus.total) * 100}
                  className="h-1.5"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {processingStatus.unprocessed} remaining — runs automatically in background
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/30 border border-white/10">
            <p className="text-xs font-medium text-foreground mb-2">How to export your messages:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>
                Install "SMS Import / Export" from{' '}
                <a
                  href="https://f-droid.org/en/packages/com.github.tmo1.sms_ie/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  F-Droid (direct download)
                </a>
              </li>
              <li>Open the app and grant SMS permissions</li>
              <li>Tap Export → choose JSON (NDJSON) format</li>
              <li>Upload the exported .zip or .ndjson file below</li>
            </ol>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Not on Google Play. F-Droid is a trusted open-source app store for Android. You can also download the APK directly from the link above without installing F-Droid.
            </p>
          </div>

          <div className="flex gap-2">
            <label className="flex-1">
              <input
                type="file"
                accept=".zip,.ndjson,.json"
                onChange={handleFileUpload}
                disabled={isImporting}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full cursor-pointer"
                disabled={isImporting}
                asChild
              >
                <span>
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {importProgress || "Importing..."}
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Upload Messages File
                    </>
                  )}
                </span>
              </Button>
            </label>

            {stats && stats.totalMessages > 0 && processingStatus && processingStatus.unprocessed > 0 && (
              <Button
                variant="outline"
                onClick={handleProcessAi}
                disabled={isProcessingAi}
                title="Reprocess unprocessed messages with AI"
                className="gap-2"
              >
                {isProcessingAi ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
                <span className="text-xs">Process {processingStatus.unprocessed}</span>
              </Button>
            )}
          </div>
        </div>

        {imports.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Import History</p>
            {imports.slice(0, 3).map((imp) => (
              <div key={imp.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-xs">
                <div>
                  <p className="font-medium text-foreground">{imp.fileName || 'messages.ndjson'}</p>
                  <p className="text-muted-foreground">
                    {imp.newMessages || 0} new, {imp.duplicateMessages || 0} skipped
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant={imp.status === 'completed' ? 'default' : imp.status === 'processing' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {imp.status}
                  </Badge>
                  <p className="text-muted-foreground mt-0.5">
                    {new Date(imp.importedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
