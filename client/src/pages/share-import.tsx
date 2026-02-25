import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, FileJson, FileArchive, MapPin, MessageSquare, CheckCircle, AlertTriangle, Upload } from "lucide-react";

type ImportType = "sms" | "locations" | "unknown";
type PageState = "loading" | "preview" | "importing" | "success" | "error" | "no-file";

interface FileMeta {
  name: string;
  type: string;
  size: number;
}

function detectImportType(meta: FileMeta): ImportType {
  const name = meta.name.toLowerCase();
  if (name.endsWith(".zip") || name.includes("sms") || name.includes("message")) return "sms";
  if (name.endsWith(".ndjson")) return "sms";
  if (name.includes("location") || name.includes("timeline") || name.includes("records")) return "locations";
  if (meta.type === "application/zip") return "sms";
  return "unknown";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ShareImport() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [importType, setImportType] = useState<ImportType>("unknown");
  const [resultMessage, setResultMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      setPageState("no-file");
      return;
    }

    caches.open("keryx-share-v1").then(async (cache) => {
      const response = await cache.match("/share-pending-file");
      if (!response) {
        setPageState("no-file");
        return;
      }

      const metaHeader = response.headers.get("X-Share-Meta");
      if (!metaHeader) {
        setPageState("no-file");
        return;
      }

      const meta: FileMeta = JSON.parse(metaHeader);
      const buffer = await response.arrayBuffer();

      setFileMeta(meta);
      setFileBuffer(buffer);
      setImportType(detectImportType(meta));
      setPageState("preview");
    }).catch(() => {
      setPageState("no-file");
    });
  }, []);

  async function handleImport() {
    if (!fileBuffer || !fileMeta) return;
    setPageState("importing");

    try {
      if (importType === "sms") {
        const blob = new Blob([fileBuffer], { type: fileMeta.type || "application/octet-stream" });
        const text = await blob.text();

        let parsed: unknown;
        try {
          if (fileMeta.name.endsWith(".ndjson")) {
            parsed = text.trim().split("\n").map((line) => JSON.parse(line));
          } else {
            parsed = JSON.parse(text);
          }
        } catch {
          parsed = text.trim().split("\n").filter(Boolean).map((line) => {
            try { return JSON.parse(line); } catch { return null; }
          }).filter(Boolean);
        }

        const res = await apiRequest("POST", "/api/messages/import", { messages: parsed });
        const data = await res.json();
        const count = data.imported ?? data.count ?? "some";
        setResultMessage(`Successfully imported ${count} message conversations.`);
      } else if (importType === "locations") {
        const blob = new Blob([fileBuffer], { type: fileMeta.type || "application/json" });
        const text = await blob.text();
        const parsed = JSON.parse(text);
        const res = await apiRequest("POST", "/api/locations/import", parsed);
        const data = await res.json();
        const count = data.locationsImported ?? data.count ?? "some";
        setResultMessage(`Successfully imported ${count} location records.`);
      }

      const cache = await caches.open("keryx-share-v1");
      await cache.delete("/share-pending-file");

      setPageState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setErrorDetail(msg);
      setPageState("error");
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    }
  }

  function handleCancel() {
    caches.open("keryx-share-v1").then((cache) => cache.delete("/share-pending-file")).catch(() => {});
    navigate("/dashboard");
  }

  const typeConfig = {
    sms: {
      icon: MessageSquare,
      label: "SMS / Messages",
      description: "Import your SMS messages for AI analysis and conversation tracking.",
      destination: "/messages",
      destLabel: "View Messages",
    },
    locations: {
      icon: MapPin,
      label: "Location History",
      description: "Import your Google Timeline location data for location tracking.",
      destination: "/locations",
      destLabel: "View Locations",
    },
    unknown: {
      icon: FileJson,
      label: "Unknown File Type",
      description: "Keryx couldn't determine the file type. Try sharing a recognised file.",
      destination: "/dashboard",
      destLabel: "Go to Dashboard",
    },
  };

  const cfg = typeConfig[importType];
  const TypeIcon = cfg.icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass-card border-white/20">
        {pageState === "loading" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                Reading shared file...
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Preparing your import.</p>
            </CardContent>
          </>
        )}

        {pageState === "no-file" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-muted-foreground" />
                No file received
              </CardTitle>
              <CardDescription>
                Share a file to Keryx from another app to import it here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/dashboard")} className="w-full">
                Go to Dashboard
              </Button>
            </CardContent>
          </>
        )}

        {pageState === "preview" && fileMeta && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TypeIcon className="w-5 h-5 text-primary" />
                Import {cfg.label}
              </CardTitle>
              <CardDescription>{cfg.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="glass-card p-3 rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  {fileMeta.name.endsWith(".zip") ? (
                    <FileArchive className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <FileJson className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium truncate">{fileMeta.name}</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">{formatBytes(fileMeta.size)}</p>
              </div>

              {importType === "unknown" && (
                <div className="flex items-start gap-2 text-amber-500 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>This file type isn't recognised. Supported files: SMS exports (.ndjson, .zip) and Google Timeline (.json).</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleCancel} className="flex-1">
                  Cancel
                </Button>
                {importType !== "unknown" && (
                  <Button onClick={handleImport} className="flex-1">
                    Import Now
                  </Button>
                )}
              </div>
            </CardContent>
          </>
        )}

        {pageState === "importing" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                Importing...
              </CardTitle>
              <CardDescription>
                Processing your file. This may take a moment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-2 bg-primary/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse w-3/4" />
              </div>
            </CardContent>
          </>
        )}

        {pageState === "success" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-500">
                <CheckCircle className="w-5 h-5" />
                Import Complete
              </CardTitle>
              <CardDescription>{resultMessage}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => navigate(cfg.destination)} className="w-full">
                {cfg.destLabel}
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
                Go to Dashboard
              </Button>
            </CardContent>
          </>
        )}

        {pageState === "error" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Import Failed
              </CardTitle>
              <CardDescription>
                {errorDetail || "Something went wrong processing your file."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => setPageState("preview")} className="w-full">
                Try Again
              </Button>
              <Button variant="outline" onClick={handleCancel} className="w-full">
                Cancel
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
