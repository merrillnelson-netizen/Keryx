import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Network, Eye, EyeOff, Copy, RefreshCcw, Plus, Trash2,
  Send, Loader2, Radio, Zap,
} from "lucide-react";

export function RelayApiCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showRelayKey, setShowRelayKey] = useState(false);
  const [newDestLabel, setNewDestLabel] = useState('');
  const [newDestUrl, setNewDestUrl] = useState('');
  const [newDestApiKey, setNewDestApiKey] = useState('');
  const [newDestTypes, setNewDestTypes] = useState<string[]>([]);
  const [showAddDest, setShowAddDest] = useState(false);

  const [testRelayType, setTestRelayType] = useState<'sms' | 'command' | 'event'>('sms');
  const [testRelayFields, setTestRelayFields] = useState({
    address: '+15551234567',
    body: 'Test SMS from Relay Dashboard',
    intent: 'log_memory',
    parameters: '{"text":"Test command payload"}',
    payload: '{"action":"ping","source":"dashboard"}',
  });
  const [testRelayResult, setTestRelayResult] = useState<{ ok: boolean; data: any } | null>(null);

  const { data: relayKeyData, refetch: refetchRelayKey } = useQuery<{ apiKey: string; endpoint: string }>({
    queryKey: ["/api/relay/key"],
    staleTime: Infinity,
  });

  const { data: relayDestinations = [], refetch: refetchDestinations } = useQuery<any[]>({
    queryKey: ["/api/relay/destinations"],
    staleTime: 1000 * 60,
  });

  const regenerateRelayKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/relay/key/regenerate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relay/key"] });
      refetchRelayKey();
      toast({ title: "Relay API key regenerated" });
    },
    onError: () => toast({ title: "Failed to regenerate key", variant: "destructive" }),
  });

  const createDestinationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/relay/destinations", {
        label: newDestLabel,
        url: newDestUrl,
        apiKey: newDestApiKey || undefined,
        payloadTypeFilter: newDestTypes.length > 0 ? newDestTypes : undefined,
        enabled: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relay/destinations"] });
      refetchDestinations();
      setNewDestLabel(''); setNewDestUrl(''); setNewDestApiKey(''); setNewDestTypes([]); setShowAddDest(false);
      toast({ title: "Destination added" });
    },
    onError: () => toast({ title: "Failed to add destination", variant: "destructive" }),
  });

  const deleteDestinationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/relay/destinations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relay/destinations"] });
      refetchDestinations();
      toast({ title: "Destination removed" });
    },
    onError: () => toast({ title: "Failed to remove destination", variant: "destructive" }),
  });

  const toggleDestinationMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/relay/destinations/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/relay/destinations"] }),
    onError: () => toast({ title: "Failed to update destination", variant: "destructive" }),
  });

  const testRelayMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { type: testRelayType, source: 'relay_dashboard' };
      if (testRelayType === 'sms') {
        body.address = testRelayFields.address;
        body.body = testRelayFields.body;
      } else if (testRelayType === 'command') {
        body.intent = testRelayFields.intent;
        try { body.parameters = JSON.parse(testRelayFields.parameters); } catch { body.parameters = testRelayFields.parameters; }
      } else {
        try { body.payload = JSON.parse(testRelayFields.payload); } catch { body.payload = testRelayFields.payload; }
      }
      const res = await apiRequest("POST", "/api/relay/test", body);
      return res.json();
    },
    onSuccess: (data) => setTestRelayResult({ ok: true, data }),
    onError: (err: any) => setTestRelayResult({ ok: false, data: { error: err?.message ?? 'Unknown error' } }),
  });

  return (
    <Card className="backdrop-blur-xl bg-white/5 dark:bg-white/5 bg-white border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-violet-500" />
          Universal Relay API
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          One authenticated endpoint that accepts SMS, voice commands, and events from any external source — your Android bridge, Meta glasses, or anything else.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* API Key */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Your Relay API Key</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-xs bg-black/10 dark:bg-white/5 rounded-lg px-3 py-2 truncate">
              {relayKeyData?.apiKey
                ? showRelayKey ? relayKeyData.apiKey : '•'.repeat(44)
                : 'Loading…'}
            </div>
            <Button size="icon" variant="ghost" onClick={() => setShowRelayKey(v => !v)}>
              {showRelayKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => {
              if (relayKeyData?.apiKey) {
                navigator.clipboard.writeText(relayKeyData.apiKey);
                toast({ title: "API key copied!" });
              }
            }}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => regenerateRelayKeyMutation.mutate()} disabled={regenerateRelayKeyMutation.isPending}>
              {regenerateRelayKeyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Include as <code className="bg-black/10 dark:bg-white/10 px-1 rounded">X-API-Key</code> header on all inbound requests.</p>
        </div>

        {/* Inbound Endpoint */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Inbound Endpoint</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-xs bg-black/10 dark:bg-white/5 rounded-lg px-3 py-2 truncate text-emerald-500">
              {relayKeyData?.endpoint ?? 'Loading…'}
            </div>
            <Button size="icon" variant="ghost" onClick={() => {
              if (relayKeyData?.endpoint) {
                navigator.clipboard.writeText(relayKeyData.endpoint);
                toast({ title: "Endpoint URL copied!" });
              }
            }}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Send <code className="bg-black/10 dark:bg-white/10 px-1 rounded">POST</code> with JSON body:</p>
            <pre className="bg-black/10 dark:bg-white/5 rounded-lg p-2 text-xs overflow-auto">{`{ "type": "sms", "address": "+15551234567", "body": "Hey!" }
{ "type": "command", "intent": "log_memory", "parameters": { "text": "..." } }
{ "type": "event", "source": "glasses", "payload": { ... } }`}</pre>
          </div>
        </div>

        {/* Fan-out Destinations */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Fan-out Destinations</Label>
            <Button size="sm" variant="outline" onClick={() => setShowAddDest(v => !v)}>
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Relay inbound payloads to additional services (your Android app, n8n webhook, etc.). SMS payloads are always saved to Keryx.
          </p>

          {showAddDest && (
            <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-3">
              <Input placeholder="Label (e.g. Android Bridge)" value={newDestLabel} onChange={e => setNewDestLabel(e.target.value)} />
              <Input placeholder="URL (https://...)" value={newDestUrl} onChange={e => setNewDestUrl(e.target.value)} />
              <Input placeholder="Outbound API key (optional)" value={newDestApiKey} onChange={e => setNewDestApiKey(e.target.value)} />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Filter by payload type (leave blank for all):</p>
                <div className="flex gap-2">
                  {(['sms', 'command', 'event'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewDestTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                      className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${newDestTypes.includes(t) ? 'bg-violet-500 border-violet-500 text-white' : 'border-white/20 text-muted-foreground hover:border-violet-400'}`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setShowAddDest(false)}>Cancel</Button>
                <Button size="sm" onClick={() => createDestinationMutation.mutate()} disabled={!newDestLabel || !newDestUrl || createDestinationMutation.isPending}>
                  {createDestinationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </div>
          )}

          {relayDestinations.length === 0 && !showAddDest && (
            <p className="text-xs text-muted-foreground italic">No fan-out destinations configured yet.</p>
          )}

          <div className="space-y-2">
            {relayDestinations.map((dest: any) => (
              <div key={dest.id} className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <Radio className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{dest.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{dest.url}</p>
                  {dest.payloadTypeFilter?.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {dest.payloadTypeFilter.map((t: string) => (
                        <Badge key={t} variant="secondary" className="text-xs px-1 py-0">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Switch
                  checked={dest.enabled}
                  onCheckedChange={(enabled) => toggleDestinationMutation.mutate({ id: dest.id, enabled })}
                />
                <Button size="icon" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => deleteDestinationMutation.mutate(dest.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Test Relay Command Center */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <Label className="text-sm font-medium">Test Relay</Label>
            <span className="text-xs text-muted-foreground">— fire a payload without needing an extension or glasses</span>
          </div>

          <div className="flex gap-2">
            {(['sms', 'command', 'event'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setTestRelayType(t); setTestRelayResult(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${testRelayType === t ? 'bg-violet-500 border-violet-500 text-white' : 'border-white/20 text-muted-foreground hover:border-violet-400'}`}
              >{t}</button>
            ))}
          </div>

          <div className="space-y-2">
            {testRelayType === 'sms' && (<>
              <Input placeholder="Phone number" value={testRelayFields.address} onChange={e => setTestRelayFields(f => ({ ...f, address: e.target.value }))} className="font-mono text-xs" />
              <Input placeholder="Message body" value={testRelayFields.body} onChange={e => setTestRelayFields(f => ({ ...f, body: e.target.value }))} />
            </>)}
            {testRelayType === 'command' && (<>
              <Input placeholder="Intent (e.g. log_memory)" value={testRelayFields.intent} onChange={e => setTestRelayFields(f => ({ ...f, intent: e.target.value }))} />
              <Input placeholder='Parameters JSON (e.g. {"text":"..."})' value={testRelayFields.parameters} onChange={e => setTestRelayFields(f => ({ ...f, parameters: e.target.value }))} className="font-mono text-xs" />
            </>)}
            {testRelayType === 'event' && (
              <Input placeholder='Payload JSON (e.g. {"action":"ping"})' value={testRelayFields.payload} onChange={e => setTestRelayFields(f => ({ ...f, payload: e.target.value }))} className="font-mono text-xs" />
            )}
          </div>

          <Button size="sm" onClick={() => testRelayMutation.mutate()} disabled={testRelayMutation.isPending} className="w-full">
            {testRelayMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Send Test Payload
          </Button>

          {testRelayResult && (
            <div className={`p-3 rounded-lg text-xs font-mono overflow-auto max-h-32 ${testRelayResult.ok ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
              {JSON.stringify(testRelayResult.data, null, 2)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
