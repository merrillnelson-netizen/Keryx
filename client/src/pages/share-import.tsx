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

interface ParsedCoord {
  lat: number;
  lng: number;
  ts: string;
  acc?: number;
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

function parseE7(val: number | undefined): number | null {
  if (val === undefined || val === null) return null;
  return val / 10000000;
}

function parseTs(ts?: string, tsMs?: string): string | null {
  if (ts) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (tsMs) {
    const d = new Date(parseInt(tsMs, 10));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function parseTimelineClientSide(text: string): ParsedCoord[] {
  const data = JSON.parse(text);
  const coords: ParsedCoord[] = [];

  // Legacy format: timelineObjects
  if (Array.isArray(data.timelineObjects)) {
    for (const obj of data.timelineObjects) {
      if (obj.placeVisit?.location) {
        const loc = obj.placeVisit.location;
        const lat = parseE7(loc.latitudeE7);
        const lng = parseE7(loc.longitudeE7);
        const ts = parseTs(obj.placeVisit.duration?.startTimestamp, obj.placeVisit.duration?.startTimestampMs);
        if (lat !== null && lng !== null && ts) coords.push({ lat, lng, ts });
      }
      if (obj.activitySegment?.startLocation) {
        const loc = obj.activitySegment.startLocation;
        const lat = parseE7(loc.latitudeE7);
        const lng = parseE7(loc.longitudeE7);
        const ts = parseTs(obj.activitySegment.duration?.startTimestamp, obj.activitySegment.duration?.startTimestampMs);
        if (lat !== null && lng !== null && ts) coords.push({ lat, lng, ts });
      }
    }
  }

  // Semantic segments format
  if (Array.isArray(data.semanticSegments)) {
    for (const seg of data.semanticSegments) {
      if (seg.visit?.topCandidate?.placeLocation?.latLng) {
        const [latStr, lngStr] = seg.visit.topCandidate.placeLocation.latLng.replace(/°/g, '').split(',').map((s: string) => s.trim());
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        const ts = seg.startTime ? new Date(seg.startTime).toISOString() : null;
        if (!isNaN(lat) && !isNaN(lng) && ts) coords.push({ lat, lng, ts });
      }
      if (seg.activity?.topCandidate && Array.isArray(seg.timelinePath) && seg.timelinePath.length > 0) {
        const pt = seg.timelinePath[0];
        if (pt.point) {
          const [latStr, lngStr] = pt.point.replace(/°/g, '').split(',').map((s: string) => s.trim());
          const lat = parseFloat(latStr);
          const lng = parseFloat(lngStr);
          const ts = pt.time ? new Date(pt.time).toISOString() : (seg.startTime ? new Date(seg.startTime).toISOString() : null);
          if (!isNaN(lat) && !isNaN(lng) && ts) coords.push({ lat, lng, ts });
        }
      }
    }
  }

  // Raw signals format
  if (Array.isArray(data.rawSignals)) {
    for (const signal of data.rawSignals) {
      const pos = signal.position;
      if (!pos) continue;
      const latLngStr = pos.LatLng || pos.latLng;
      if (!latLngStr) continue;
      const parts = latLngStr.replace(/°/g, '').split(',').map((s: string) => s.trim());
      if (parts.length !== 2) continue;
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      if (!pos.timestamp) continue;
      const ts = new Date(pos.timestamp);
      if (isNaN(ts.getTime())) continue;
      coords.push({ lat, lng, ts: ts.toISOString(), acc: pos.accuracyMeters });
    }
  }

  coords.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return coords;
}

const BATCH_SIZE = 2000;

export default function ShareImport() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [importType, setImportType] = useState<ImportType>("unknown");
  const [resultMessage, setResultMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      setPageState("no-file");
      return;
    }

    caches.open("keryx-share-v1").then(async (cache) => {
      const response = await cache.match("/share-pending-file");
      if (!response) { setPageState("no-file"); return; }

      const metaHeader = response.headers.get("X-Share-Meta");
      if (!metaHeader) { setPageState("no-file"); return; }

      const meta: FileMeta = JSON.parse(metaHeader);
      const buffer = await response.arrayBuffer();

      setFileMeta(meta);
      setFileBuffer(buffer);
      setImportType(detectImportType(meta));
      setPageState("preview");
    }).catch(() => setPageState("no-file"));
  }, []);

  async function handleImport() {
    if (!fileBuffer || !fileMeta) return;
    setPageState("importing");
    setProgress(0);

    try {
      if (importType === "sms") {
        let fileContent: string;
        setProgressLabel("Reading file...");

        if (fileMeta.name.endsWith(".zip")) {
          const { BlobReader, ZipReader, TextWriter } = await import("@zip.js/zip.js");
          const blob = new Blob([fileBuffer], { type: "application/zip" });
          const reader = new ZipReader(new BlobReader(blob));
          const entries = await reader.getEntries();
          const dataEntry = entries.find((e: { filename: string }) =>
            e.filename.endsWith(".ndjson") || e.filename.endsWith(".json") || e.filename.endsWith(".txt")
          );
          if (!dataEntry || !("getData" in dataEntry) || typeof (dataEntry as { getData?: unknown }).getData !== "function") {
            await reader.close();
            throw new Error("No data file found in ZIP archive. Files found: " + entries.map((e: { filename: string }) => e.filename).join(", "));
          }
          fileContent = await (dataEntry as { getData: (writer: unknown) => Promise<string> }).getData(new TextWriter());
          await reader.close();
        } else {
          const blob = new Blob([fileBuffer], { type: fileMeta.type || "application/octet-stream" });
          fileContent = await blob.text();
        }

        setProgressLabel("Uploading messages...");
        setProgress(50);

        const res = await apiRequest("POST", "/api/messages/import", {
          fileContent,
          fileName: fileMeta.name,
        });
        const data = await res.json();
        if (!data.success && data.message) throw new Error(data.message);
        const convCount = data.conversations ?? "some";
        const msgCount = data.newMessages ?? data.imported ?? "";
        setResultMessage(
          `Imported ${convCount} conversation${convCount !== 1 ? "s" : ""}${msgCount ? ` (${msgCount} new messages)` : ""}.`
        );

      } else if (importType === "locations") {
        setProgressLabel("Parsing location data...");
        setProgress(5);

        const blob = new Blob([fileBuffer], { type: fileMeta.type || "application/json" });
        const text = await blob.text();

        let coords: ParsedCoord[];
        try {
          coords = parseTimelineClientSide(text);
        } catch {
          throw new Error("Invalid JSON format. Please ensure this is a valid Google Timeline export file.");
        }

        if (coords.length === 0) {
          throw new Error("No valid location records found in this file.");
        }

        const totalBatches = Math.ceil(coords.length / BATCH_SIZE);
        let totalImported = 0;
        let lastResult: { locationsImported?: number; placesDetected?: number; dateRange?: { start: string; end: string } } = {};

        for (let i = 0; i < coords.length; i += BATCH_SIZE) {
          const batch = coords.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          setProgressLabel(`Uploading batch ${batchNum} of ${totalBatches}...`);
          setProgress(10 + Math.round((batchNum / totalBatches) * 85));

          const res = await apiRequest("POST", "/api/locations/import-parsed", { locations: batch });
          const data = await res.json();
          if (!data.success && data.message) throw new Error(data.message);
          totalImported += data.locationsImported ?? 0;
          lastResult = data;
        }

        setProgress(100);
        const placesMsg = lastResult.placesDetected ? ` ${lastResult.placesDetected} frequent places detected.` : "";
        setResultMessage(`Imported ${totalImported.toLocaleString()} location records from ${coords.length.toLocaleString()} parsed entries.${placesMsg}`);
      }

      const cache = await caches.open("keryx-share-v1");
      await cache.delete("/share-pending-file");
      setPageState("success");

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Import failed";
      const jsonMatch = errMsg.match(/\{"message"\s*:\s*"([^"]+)"/);
      const msg = jsonMatch ? jsonMatch[1] : errMsg;
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
      description: "Import your Google Timeline location data. Large files are parsed here in the browser — no size limit.",
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
                {progressLabel || "Processing your file. This may take a moment."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-2 bg-primary/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, progress)}%` }}
                />
              </div>
              {progress > 0 && (
                <p className="text-xs text-muted-foreground text-right">{progress}%</p>
              )}
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
