import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  MapPin, Upload, Trash2, Home, Building2, Coffee, Dumbbell, 
  ChevronRight, Loader2, Check, X, AlertCircle, ExternalLink,
  Calendar, Clock, Navigation
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

export default function LocationsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');

  const { data: stats, isLoading: statsLoading } = useQuery<LocationStats>({
    queryKey: ['/api/locations/stats'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: places, isLoading: placesLoading } = useQuery<FrequentPlace[]>({
    queryKey: ['/api/locations/places'],
    staleTime: 5 * 60 * 1000,
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Invalid file',
        description: 'Please select a JSON file from Google Takeout',
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

  const formatDuration = (minutes?: number) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
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
            Import from Google Takeout
          </CardTitle>
          <CardDescription>
            Upload your Google Timeline data to enable location-aware insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-sm">How to get your location data:</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to <a href="https://takeout.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Google Takeout <ExternalLink className="w-3 h-3" /></a></li>
              <li>Click "Deselect all", then scroll to find "Location History"</li>
              <li>Select it and choose JSON format (not KML)</li>
              <li>Create export and wait for the download link</li>
              <li>Extract the ZIP and find files in "Location History/Semantic Location History"</li>
              <li>Upload the JSON files here (one at a time)</li>
            </ol>
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
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Frequent Places
          </CardTitle>
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
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-3">
                {places.map((place) => (
                  <div
                    key={place.id}
                    className={`p-4 rounded-lg border ${
                      place.isConfirmed
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-muted/30 border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {place.label && labelIcons[place.label] && (
                            <span className={`p-1.5 rounded ${labelColors[place.label] || 'bg-muted'}`}>
                              {labelIcons[place.label]}
                            </span>
                          )}
                          <h4 className="font-medium truncate">{place.name}</h4>
                          {place.isConfirmed && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                              <Check className="w-3 h-3 mr-1" />
                              Confirmed
                            </Badge>
                          )}
                        </div>
                        
                        {place.address && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {place.address}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
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
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!place.isConfirmed && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPlaceLabel(place.id, 'home')}
                              className="h-8 px-2"
                              title="Set as Home"
                            >
                              <Home className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPlaceLabel(place.id, 'work')}
                              className="h-8 px-2"
                              title="Set as Work"
                            >
                              <Building2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => confirmPlace(place.id)}
                              className="h-8"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Confirm
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => hidePlace(place.id)}
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          title="Hide this place"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No frequent places detected yet</p>
              <p className="text-sm mt-1">Import your location history to get started</p>
            </div>
          )}
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
          <p>Your location history helps Helix provide more personalized and contextual insights:</p>
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
  );
}
