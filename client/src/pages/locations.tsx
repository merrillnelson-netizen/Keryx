import { useState, useRef } from 'react';
import AppLayout from "@/components/app-layout";
import { TierGate } from "@/components/tier-gate";
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  MapPin, Upload, Trash2, Home, Building2, Coffee, Dumbbell, 
  Loader2, Check, X, AlertCircle, Calendar, Clock, Navigation, Edit3,
  Wand2, Layers
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LocationStats {
  totalLocations: number;
  frequentPlacesCount: number;
  hasHomeSet: boolean;
  hasWorkSet: boolean;
  recentLocationsCount: number;
}

interface FrequentPlace {
  id: string;
  name: string;
  label?: string;
  latitude: number;
  longitude: number;
  address?: string;
  category?: string;
  visitCount?: number;
  totalTimeMinutes?: number;
  averageVisitMinutes?: number;
  lastVisit?: string;
  firstVisit?: string;
  typicalDays?: string[];
  isConfirmed: boolean;
  isHidden: boolean;
}

interface ImportResult {
  success: boolean;
  importBatchId: string;
  locationsImported: number;
  placesDetected: number;
  dateRange?: {
    start: string;
    end: string;
  };
}

const labelIcons: Record<string, React.ReactNode> = {
  home: <Home className="w-4 h-4" />,
  work: <Building2 className="w-4 h-4" />,
  gym: <Dumbbell className="w-4 h-4" />,
  cafe: <Coffee className="w-4 h-4" />,
};

const labelColors: Record<string, string> = {
  home: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  work: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  gym: 'bg-green-500/20 text-green-400 border-green-500/30',
  cafe: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

function getDisplayName(place: { label?: string | null; name: string }): { displayName: string; originalName: string | null } {
  if (!place.label) {
    return { displayName: place.name, originalName: null };
  }
  const displayName = place.label === 'home' ? 'Home' 
    : place.label === 'work' ? 'Work' 
    : place.label;
  return { displayName, originalName: place.name };
}

interface ParsedLocation {
  lat: number;
  lng: number;
  ts: string;
  src?: string;
  acc?: number;
}

function parseTimelineFile(jsonContent: string): ParsedLocation[] {
  const locations: ParsedLocation[] = [];
  
  try {
    const data = JSON.parse(jsonContent);
    
    // Parse rawSignals (new device export format)
    if (data.rawSignals && Array.isArray(data.rawSignals)) {
      for (const signal of data.rawSignals) {
        if (!signal.position) continue;
        const pos = signal.position;
        const latLngStr = pos.LatLng || pos.latLng;
        if (!latLngStr || !pos.timestamp) continue;
        
        const cleanedStr = latLngStr.replace(/°/g, '');
        const parts = cleanedStr.split(',').map((s: string) => s.trim());
        if (parts.length !== 2) continue;
        
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        
        const ts = new Date(pos.timestamp);
        if (isNaN(ts.getTime())) continue;
        
        locations.push({
          lat, lng,
          ts: ts.toISOString(),
          src: pos.source,
          acc: pos.accuracyMeters
        });
      }
    }
    
    // Parse semanticSegments
    if (data.semanticSegments && Array.isArray(data.semanticSegments)) {
      for (const segment of data.semanticSegments) {
        if (segment.visit?.topCandidate?.placeLocation?.latLng) {
          const latLngStr = segment.visit.topCandidate.placeLocation.latLng;
          const cleanedStr = latLngStr.replace(/°/g, '');
          const parts = cleanedStr.split(',').map((s: string) => s.trim());
          if (parts.length !== 2) continue;
          
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (isNaN(lat) || isNaN(lng)) continue;
          
          const ts = segment.startTime ? new Date(segment.startTime) : null;
          if (!ts || isNaN(ts.getTime())) continue;
          
          locations.push({ lat, lng, ts: ts.toISOString() });
        }
      }
    }
    
    // Parse legacy timelineObjects
    if (data.timelineObjects && Array.isArray(data.timelineObjects)) {
      for (const obj of data.timelineObjects) {
        if (obj.placeVisit?.location) {
          const loc = obj.placeVisit.location;
          if (loc.latitudeE7 && loc.longitudeE7) {
            const lat = loc.latitudeE7 / 10000000;
            const lng = loc.longitudeE7 / 10000000;
            const ts = obj.placeVisit.duration?.startTimestamp ? new Date(obj.placeVisit.duration.startTimestamp) : null;
            if (ts && !isNaN(ts.getTime())) {
              locations.push({ lat, lng, ts: ts.toISOString() });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Parse error:', e);
  }
  
  return locations;
}

function LocationsPageInner() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [showHidden, setShowHidden] = useState(false);
  
  // Custom name dialog state
  const [customNameDialogOpen, setCustomNameDialogOpen] = useState(false);
  const [customNamePlaceId, setCustomNamePlaceId] = useState<string | null>(null);
  const [customNameValue, setCustomNameValue] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery<LocationStats>({
    queryKey: ['/api/locations/stats'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: places, isLoading: placesLoading } = useQuery<FrequentPlace[]>({
    queryKey: ['/api/locations/places'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: hiddenPlaces } = useQuery<FrequentPlace[]>({
    queryKey: ['/api/locations/places/hidden'],
    staleTime: 5 * 60 * 1000,
    enabled: showHidden,
  });

  const importMutation = useMutation({
    mutationFn: async (locations: ParsedLocation[]) => {
      const res = await apiRequest('POST', '/api/locations/import-parsed', { locations });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Import failed');
      }
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places'] });
      toast({
        title: 'Import Successful',
        description: `Imported ${data.locationsImported} locations and detected ${data.placesDetected} frequent places.`,
      });
      setIsImporting(false);
      setImportProgress('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import location data',
        variant: 'destructive',
      });
      setIsImporting(false);
      setImportProgress('');
    },
  });

  const updatePlaceMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<FrequentPlace> }) => {
      const res = await apiRequest('PATCH', `/api/locations/places/${id}`, updates);
      if (!res.ok) throw new Error('Failed to update place');
      return res.json() as Promise<FrequentPlace>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places'] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places/hidden'] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations/stats'] });
    },
  });

  const deletePlaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/locations/places/${id}`);
      if (!res.ok) throw new Error('Failed to delete place');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places'] });
      toast({ title: 'Place removed' });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/locations');
      if (!res.ok) throw new Error('Failed to delete location data');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places'] });
      toast({ title: 'All location data deleted' });
    },
  });

  const geocodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/locations/places/geocode', {});
      if (!res.ok) throw new Error('Failed to get addresses');
      return res.json() as Promise<{ success: boolean; geocoded: number; remaining: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places'] });
      if (data.geocoded > 0) {
        toast({ 
          title: `Found ${data.geocoded} addresses`,
          description: data.remaining > 0 ? `${data.remaining} places remaining` : undefined
        });
      } else {
        toast({ title: 'All places already have addresses' });
      }
    },
    onError: () => {
      toast({ title: 'Failed to get addresses', variant: 'destructive' });
    },
  });

  const deduplicateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/locations/places/deduplicate', {});
      if (!res.ok) throw new Error('Failed to merge duplicates');
      return res.json() as Promise<{ success: boolean; merged: number; remaining: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places'] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations/stats'] });
      if (data.merged > 0) {
        toast({
          title: `Merged ${data.merged} duplicate${data.merged !== 1 ? 's' : ''}`,
          description: `${data.remaining} unique places remaining`,
        });
      } else {
        toast({ title: 'No duplicates found — all places are already unique' });
      }
    },
    onError: () => {
      toast({ title: 'Failed to merge duplicates', variant: 'destructive' });
    },
  });

  const aiNameMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/locations/places/ai-name', {});
      if (!res.ok) throw new Error('Failed to AI-name places');
      return res.json() as Promise<{ success: boolean; named: number; message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations/places'] });
      if (data.named > 0) {
        toast({
          title: `Named ${data.named} place${data.named !== 1 ? 's' : ''}`,
          description: 'Review the suggestions and confirm or rename as needed',
        });
      } else {
        toast({ title: data.message || 'No unnamed places to process' });
      }
    },
    onError: () => {
      toast({ title: 'Failed to name places', variant: 'destructive' });
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Invalid file',
        description: 'Please select a JSON file from your device Timeline export',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setImportProgress('Reading file...');

    try {
      const content = await file.text();
      setImportProgress('Parsing locations...');
      
      const parsedLocations = parseTimelineFile(content);
      
      if (parsedLocations.length === 0) {
        toast({
          title: 'No locations found',
          description: 'Could not find valid location data in this file',
          variant: 'destructive',
        });
        setIsImporting(false);
        setImportProgress('');
        return;
      }
      
      setImportProgress(`Uploading ${parsedLocations.length.toLocaleString()} locations...`);
      importMutation.mutate(parsedLocations);
    } catch (error) {
      toast({
        title: 'File read error',
        description: 'Could not read the selected file',
        variant: 'destructive',
      });
      setIsImporting(false);
      setImportProgress('');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const setPlaceLabel = (placeId: string, label: string) => {
    updatePlaceMutation.mutate({
      id: placeId,
      updates: { label, isConfirmed: true },
    });
  };

  const confirmPlace = (placeId: string) => {
    updatePlaceMutation.mutate({
      id: placeId,
      updates: { isConfirmed: true },
    });
  };

  const hidePlace = (placeId: string) => {
    updatePlaceMutation.mutate({
      id: placeId,
      updates: { isHidden: true },
    });
  };

  const unhidePlace = (placeId: string) => {
    updatePlaceMutation.mutate({
      id: placeId,
      updates: { isHidden: false },
    });
  };

  const clearLabel = (placeId: string) => {
    updatePlaceMutation.mutate({
      id: placeId,
      updates: { label: undefined, isConfirmed: false },
    });
  };

  const unconfirmPlace = (placeId: string) => {
    updatePlaceMutation.mutate({
      id: placeId,
      updates: { isConfirmed: false },
    });
  };

  const openCustomNameDialog = (placeId: string, currentLabel?: string) => {
    setCustomNamePlaceId(placeId);
    setCustomNameValue(currentLabel && !['home', 'work'].includes(currentLabel) ? currentLabel : '');
    setCustomNameDialogOpen(true);
  };

  const saveCustomName = () => {
    if (!customNamePlaceId || !customNameValue.trim()) return;
    
    updatePlaceMutation.mutate({
      id: customNamePlaceId,
      updates: { label: customNameValue.trim(), isConfirmed: true },
    });
    
    setCustomNameDialogOpen(false);
    setCustomNamePlaceId(null);
    setCustomNameValue('');
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
      <>
      <div className="container max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="w-6 h-6 text-primary" />
              Location History
            </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Import your Google Timeline data to enrich your briefings with location context
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Timeline Data
          </CardTitle>
          <CardDescription>
            Upload your Google Timeline data to enable location-aware insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-sm">How to get your location data:</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Open <strong>Settings</strong> on your Android phone</li>
              <li>Go to <strong>Location → Location Services → Timeline</strong></li>
              <li>Tap the menu (⋮) and select <strong>Export Timeline data</strong></li>
              <li>Choose a date range and save the JSON file</li>
              <li>Transfer the file to this device and upload it here</li>
            </ol>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <h4 className="font-medium text-sm">How often should I import?</h4>
                <p className="text-sm text-muted-foreground">
                  For best results, import your Timeline data <strong>monthly</strong> or after trips. 
                  Each import adds new locations — duplicates are automatically handled, so re-importing is safe.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              disabled={isImporting}
              className="flex-1"
            />
            {isImporting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {importProgress}
              </div>
            )}
          </div>

          {stats && stats.totalLocations > 0 && (
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{stats.totalLocations.toLocaleString()}</span> locations
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{stats.frequentPlacesCount}</span> places detected
                </span>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all location data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {stats.totalLocations.toLocaleString()} location entries and detected places. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAllMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Frequent Places
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {places && places.some(p => !p.address) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => geocodeMutation.mutate()}
                  disabled={geocodeMutation.isPending}
                >
                  {geocodeMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Getting addresses...
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4 mr-2" />
                      Get Addresses
                    </>
                  )}
                </Button>
              )}
              {places && places.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deduplicateMutation.mutate()}
                  disabled={deduplicateMutation.isPending}
                >
                  {deduplicateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Merging...
                    </>
                  ) : (
                    <>
                      <Layers className="w-4 h-4 mr-2" />
                      Merge Duplicates
                    </>
                  )}
                </Button>
              )}
              {places && places.some(p => !p.isHidden && !p.isConfirmed && /^Location \d+$/.test(p.name)) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => aiNameMutation.mutate()}
                  disabled={aiNameMutation.isPending}
                >
                  {aiNameMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Naming...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      AI Name All
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            Places you visit often, detected from your location history. Confirm important ones to improve your briefings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {placesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : places && places.length > 0 ? (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {places.map((place) => (
                <div
                  key={place.id}
                  className={`p-3 rounded-lg border ${
                    place.isConfirmed
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-muted/30 border-border'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {place.label && labelIcons[place.label] && (
                      <span className={`p-1.5 rounded shrink-0 ${labelColors[place.label] || 'bg-muted'}`}>
                        {labelIcons[place.label]}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(() => {
                          const { displayName, originalName } = getDisplayName(place);
                          return (
                            <>
                              <h4 className="font-medium">{displayName}</h4>
                              {originalName && (
                                <span className="text-xs text-muted-foreground">({originalName})</span>
                              )}
                            </>
                          );
                        })()}
                        {place.isConfirmed && (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                            <Check className="w-3 h-3 mr-1" />
                            Confirmed
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mt-1">
                        {place.address || `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
                      </p>
                      
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {place.visitCount || 0} visits
                        </span>
                        {place.averageVisitMinutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            ~{formatDuration(place.averageVisitMinutes)} avg
                          </span>
                        )}
                        {place.typicalDays && place.typicalDays.length > 0 && (
                          <span className="capitalize">
                            {place.typicalDays.slice(0, 3).join(', ')}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50 flex-wrap">
                        {!place.isConfirmed ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPlaceLabel(place.id, 'home')}
                              className="h-7 px-2 text-xs"
                            >
                              <Home className="w-3 h-3 mr-1" />
                              Home
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPlaceLabel(place.id, 'work')}
                              className="h-7 px-2 text-xs"
                            >
                              <Building2 className="w-3 h-3 mr-1" />
                              Work
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openCustomNameDialog(place.id, place.label)}
                              className="h-7 px-2 text-xs"
                            >
                              <Edit3 className="w-3 h-3 mr-1" />
                              Name...
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => confirmPlace(place.id)}
                              className="h-7 px-2 text-xs"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Confirm
                            </Button>
                          </>
                        ) : (
                          <>
                            {place.label !== 'home' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlaceLabel(place.id, 'home')}
                                className="h-7 px-2 text-xs"
                              >
                                <Home className="w-3 h-3 mr-1" />
                                Set Home
                              </Button>
                            )}
                            {place.label !== 'work' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlaceLabel(place.id, 'work')}
                                className="h-7 px-2 text-xs"
                              >
                                <Building2 className="w-3 h-3 mr-1" />
                                Set Work
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openCustomNameDialog(place.id, place.label)}
                              className="h-7 px-2 text-xs"
                            >
                              <Edit3 className="w-3 h-3 mr-1" />
                              {place.label && !['home', 'work'].includes(place.label) ? 'Rename' : 'Name...'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => unconfirmPlace(place.id)}
                              className="h-7 px-2 text-xs text-amber-500 hover:text-amber-400"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Unconfirm
                            </Button>
                            {place.label && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => clearLabel(place.id)}
                                className="h-7 px-2 text-xs text-muted-foreground"
                              >
                                Clear Label
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => hidePlace(place.id)}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive ml-auto"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Hide
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No frequent places detected yet</p>
              <p className="text-sm mt-1">Import your location history to get started</p>
            </div>
          )}
          
          {/* Show Hidden Places Toggle */}
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHidden(!showHidden)}
              className="text-xs text-muted-foreground"
            >
              {showHidden ? 'Hide' : 'Show'} hidden places
            </Button>
            
            {showHidden && hiddenPlaces && hiddenPlaces.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground mb-2">Hidden places:</p>
                {hiddenPlaces.map((place) => (
                  <div
                    key={place.id}
                    className="p-3 rounded-lg border border-dashed border-border/50 bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        {(() => {
                          const { displayName, originalName } = getDisplayName(place);
                          return (
                            <h4 className="font-medium text-sm">
                              {displayName}
                              {originalName && (
                                <span className="text-xs text-muted-foreground ml-1">({originalName})</span>
                              )}
                            </h4>
                          );
                        })()}
                        <p className="text-xs text-muted-foreground">
                          {place.address || `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unhidePlace(place.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Unhide
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {showHidden && (!hiddenPlaces || hiddenPlaces.length === 0) && (
              <p className="text-xs text-muted-foreground mt-2">No hidden places</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            How Location Data is Used
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Your location history helps Keryx provide more personalized and contextual insights:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Morning briefings can mention your commute patterns and routines</li>
            <li>AI insights understand your lifestyle based on places you frequent</li>
            <li>Pattern analysis can detect changes in your habits over time</li>
            <li>Location context enriches memory search and recall</li>
          </ul>
          <p className="pt-2 text-xs">
            Your location data is stored securely and never shared. You can delete it at any time.
          </p>
        </CardContent>
      </Card>
      </div>

      {/* Custom Name Dialog */}
      <Dialog open={customNameDialogOpen} onOpenChange={setCustomNameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name This Place</DialogTitle>
            <DialogDescription>
              Enter a custom name for this location (e.g., "Gym", "Coffee Shop", "Mom's House")
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customName">Place Name</Label>
              <Input
                id="customName"
                value={customNameValue}
                onChange={(e) => setCustomNameValue(e.target.value)}
                placeholder="Enter a name..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveCustomName();
                  }
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Quick picks:</span>
              {['Gym', 'Cafe', 'Restaurant', 'Store', 'Park', 'Church', 'School'].map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setCustomNameValue(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomNameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCustomName} disabled={!customNameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
  );
}

export default function LocationsPage() {
  return (
    <AppLayout>
      <TierGate required={"life_os"} feature={"Location Intelligence"} description={"Capture, analyze, and search your location history."}>
        <LocationsPageInner />
      </TierGate>
    </AppLayout>
  );
}
