import { InsertLocationHistory, InsertFrequentPlace, LocationHistory, FrequentPlace } from "@shared/schema";

// Reverse geocode coordinates to get address using OpenStreetMap Nominatim
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'Helix-App/1.0',
          'Accept-Language': 'en'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.address) return null;
    
    const addr = data.address;
    const parts: string[] = [];
    
    // Build readable address
    if (addr.house_number && addr.road) {
      parts.push(`${addr.house_number} ${addr.road}`);
    } else if (addr.road) {
      parts.push(addr.road);
    }
    
    if (addr.suburb || addr.neighbourhood) {
      parts.push(addr.suburb || addr.neighbourhood);
    }
    
    if (addr.city || addr.town || addr.village) {
      parts.push(addr.city || addr.town || addr.village);
    }
    
    return parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(',') || null;
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return null;
  }
}

// Batch reverse geocode multiple locations with rate limiting
export async function batchReverseGeocode(
  places: Array<{ latitude: number; longitude: number; id?: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  for (const place of places) {
    // Rate limit: Nominatim requires 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const address = await reverseGeocode(place.latitude, place.longitude);
    if (address) {
      const key = place.id || `${place.latitude},${place.longitude}`;
      results.set(key, address);
    }
  }
  
  return results;
}

export interface GoogleTimelineLocation {
  latitudeE7?: number;
  longitudeE7?: number;
  timestamp?: string;
  timestampMs?: string;
  accuracy?: number;
  placeId?: string;
  address?: string;
  name?: string;
  locationConfidence?: number;
  deviceTag?: number;
  source?: string;
}

export interface GoogleTimelineActivitySegment {
  startLocation?: GoogleTimelineLocation;
  endLocation?: GoogleTimelineLocation;
  duration?: {
    startTimestamp?: string;
    startTimestampMs?: string;
    endTimestamp?: string;
    endTimestampMs?: string;
  };
  activityType?: string;
  confidence?: string;
  waypointPath?: {
    waypoints?: GoogleTimelineLocation[];
  };
}

export interface GoogleTimelinePlaceVisit {
  location?: GoogleTimelineLocation;
  duration?: {
    startTimestamp?: string;
    startTimestampMs?: string;
    endTimestamp?: string;
    endTimestampMs?: string;
  };
  placeConfidence?: string;
  centerLatE7?: number;
  centerLngE7?: number;
  visitConfidence?: number;
  locationConfidence?: number;
  placeVisitType?: string;
  placeVisitImportance?: string;
}

export interface RawSignalPosition {
  LatLng?: string;
  latLng?: string;
  accuracyMeters?: number;
  altitudeMeters?: number;
  source?: string;
  timestamp?: string;
  speedMetersPerSecond?: number;
}

export interface RawSignal {
  position?: RawSignalPosition;
}

export interface GoogleTimelineObject {
  timelineObjects?: Array<{
    activitySegment?: GoogleTimelineActivitySegment;
    placeVisit?: GoogleTimelinePlaceVisit;
  }>;
  semanticSegments?: Array<{
    startTime?: string;
    endTime?: string;
    timelinePath?: Array<{
      point?: string;
      time?: string;
    }>;
    visit?: {
      topCandidate?: {
        placeId?: string;
        semanticType?: string;
        probability?: number;
        placeLocation?: {
          latLng?: string;
        };
      };
    };
    activity?: {
      start?: string;
      end?: string;
      topCandidate?: {
        type?: string;
        probability?: number;
      };
    };
  }>;
  rawSignals?: RawSignal[];
}

export interface ParsedLocation {
  latitude: number;
  longitude: number;
  timestamp: Date;
  placeName?: string;
  placeId?: string;
  address?: string;
  placeType?: string;
  durationMinutes?: number;
  activityType?: string;
  confidence?: number;
  source: 'google_takeout' | 'memory' | 'manual';
}

export interface ImportResult {
  totalParsed: number;
  locationsImported: number;
  placesDetected: number;
  errors: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

function parseE7Coordinate(e7Value: number | undefined): number | null {
  if (e7Value === undefined || e7Value === null) return null;
  return e7Value / 10000000;
}

function parseTimestamp(ts?: string, tsMs?: string): Date | null {
  if (ts) {
    const date = new Date(ts);
    if (!isNaN(date.getTime())) return date;
  }
  if (tsMs) {
    const date = new Date(parseInt(tsMs, 10));
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

function parseConfidence(confidence?: string | number): number | null {
  if (typeof confidence === 'number') return Math.min(100, Math.max(0, confidence));
  if (typeof confidence === 'string') {
    const map: Record<string, number> = {
      'HIGH': 90,
      'MEDIUM': 60,
      'LOW': 30,
      'NO_CONFIDENCE': 0
    };
    return map[confidence.toUpperCase()] ?? null;
  }
  return null;
}

function calculateDurationMinutes(duration?: { startTimestamp?: string; startTimestampMs?: string; endTimestamp?: string; endTimestampMs?: string }): number | null {
  if (!duration) return null;
  const start = parseTimestamp(duration.startTimestamp, duration.startTimestampMs);
  const end = parseTimestamp(duration.endTimestamp, duration.endTimestampMs);
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / 60000);
}

export function parseLegacyTimelineFormat(data: GoogleTimelineObject): ParsedLocation[] {
  const locations: ParsedLocation[] = [];
  
  if (!data.timelineObjects || !Array.isArray(data.timelineObjects)) {
    return locations;
  }

  for (const obj of data.timelineObjects) {
    if (obj.placeVisit) {
      const visit = obj.placeVisit;
      const loc = visit.location;
      if (!loc) continue;

      const lat = parseE7Coordinate(loc.latitudeE7);
      const lng = parseE7Coordinate(loc.longitudeE7);
      const ts = parseTimestamp(visit.duration?.startTimestamp, visit.duration?.startTimestampMs);

      if (lat === null || lng === null || !ts) continue;

      locations.push({
        latitude: lat,
        longitude: lng,
        timestamp: ts,
        placeName: loc.name,
        placeId: loc.placeId,
        address: loc.address,
        placeType: visit.placeVisitType,
        durationMinutes: calculateDurationMinutes(visit.duration) ?? undefined,
        activityType: 'STILL',
        confidence: parseConfidence(visit.placeConfidence) ?? parseConfidence(loc.locationConfidence) ?? undefined,
        source: 'google_takeout'
      });
    }

    if (obj.activitySegment) {
      const segment = obj.activitySegment;
      const startLoc = segment.startLocation;
      if (!startLoc) continue;

      const lat = parseE7Coordinate(startLoc.latitudeE7);
      const lng = parseE7Coordinate(startLoc.longitudeE7);
      const ts = parseTimestamp(segment.duration?.startTimestamp, segment.duration?.startTimestampMs);

      if (lat === null || lng === null || !ts) continue;

      locations.push({
        latitude: lat,
        longitude: lng,
        timestamp: ts,
        durationMinutes: calculateDurationMinutes(segment.duration) ?? undefined,
        activityType: segment.activityType,
        confidence: parseConfidence(segment.confidence) ?? undefined,
        source: 'google_takeout'
      });
    }
  }

  return locations;
}

export function parseSemanticLocationFormat(data: GoogleTimelineObject): ParsedLocation[] {
  const locations: ParsedLocation[] = [];
  
  if (!data.semanticSegments || !Array.isArray(data.semanticSegments)) {
    return locations;
  }

  for (const segment of data.semanticSegments) {
    if (segment.visit?.topCandidate) {
      const visit = segment.visit.topCandidate;
      let lat: number | null = null;
      let lng: number | null = null;

      if (visit.placeLocation?.latLng) {
        const [latStr, lngStr] = visit.placeLocation.latLng.replace('°', '').split(',').map(s => s.trim());
        lat = parseFloat(latStr);
        lng = parseFloat(lngStr);
      }

      const ts = segment.startTime ? new Date(segment.startTime) : null;
      const endTs = segment.endTime ? new Date(segment.endTime) : null;

      if (lat === null || lng === null || isNaN(lat) || isNaN(lng) || !ts || isNaN(ts.getTime())) continue;

      let durationMinutes: number | undefined;
      if (ts && endTs && !isNaN(endTs.getTime())) {
        durationMinutes = Math.round((endTs.getTime() - ts.getTime()) / 60000);
      }

      locations.push({
        latitude: lat,
        longitude: lng,
        timestamp: ts,
        placeId: visit.placeId,
        placeType: visit.semanticType,
        durationMinutes,
        activityType: 'STILL',
        confidence: visit.probability ? Math.round(visit.probability * 100) : undefined,
        source: 'google_takeout'
      });
    }

    if (segment.activity?.topCandidate) {
      const activity = segment.activity.topCandidate;
      if (segment.timelinePath && segment.timelinePath.length > 0) {
        const firstPoint = segment.timelinePath[0];
        if (firstPoint.point) {
          const [latStr, lngStr] = firstPoint.point.replace('°', '').split(',').map(s => s.trim());
          const lat = parseFloat(latStr);
          const lng = parseFloat(lngStr);
          const ts = firstPoint.time ? new Date(firstPoint.time) : (segment.startTime ? new Date(segment.startTime) : null);

          if (!isNaN(lat) && !isNaN(lng) && ts && !isNaN(ts.getTime())) {
            locations.push({
              latitude: lat,
              longitude: lng,
              timestamp: ts,
              activityType: activity.type,
              confidence: activity.probability ? Math.round(activity.probability * 100) : undefined,
              source: 'google_takeout'
            });
          }
        }
      }
    }
  }

  return locations;
}

export function parseRawSignalsFormat(data: GoogleTimelineObject): ParsedLocation[] {
  const locations: ParsedLocation[] = [];
  
  if (!data.rawSignals || !Array.isArray(data.rawSignals)) {
    return locations;
  }

  // Log first signal for debugging
  if (data.rawSignals.length > 0) {
    console.log(`[Location Import] First rawSignal sample:`, JSON.stringify(data.rawSignals[0]).substring(0, 500));
  }

  let skippedNoPosition = 0;
  let skippedNoLatLng = 0;
  let skippedInvalidCoords = 0;
  let skippedNoTimestamp = 0;

  for (const signal of data.rawSignals) {
    if (!signal.position) {
      skippedNoPosition++;
      continue;
    }
    
    const pos = signal.position;
    const latLngStr = pos.LatLng || pos.latLng;
    
    if (!latLngStr) {
      skippedNoLatLng++;
      continue;
    }
    
    // Parse "33.3954644°, -111.8368823°" format
    const cleanedStr = latLngStr.replace(/°/g, '');
    const parts = cleanedStr.split(',').map(s => s.trim());
    
    if (parts.length !== 2) {
      skippedInvalidCoords++;
      continue;
    }
    
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      skippedInvalidCoords++;
      continue;
    }
    
    // Parse timestamp (ISO format: "2025-12-30T14:38:10.000-07:00")
    let timestamp: Date | null = null;
    if (pos.timestamp) {
      timestamp = new Date(pos.timestamp);
      if (isNaN(timestamp.getTime())) timestamp = null;
    }
    
    if (!timestamp) {
      skippedNoTimestamp++;
      continue;
    }
    
    locations.push({
      latitude: lat,
      longitude: lng,
      timestamp,
      activityType: pos.source || undefined,
      confidence: pos.accuracyMeters ? Math.max(0, Math.min(100, 100 - pos.accuracyMeters)) : undefined,
      source: 'google_takeout'
    });
  }

  console.log(`[Location Import] Raw signals parsing stats - NoPosition: ${skippedNoPosition}, NoLatLng: ${skippedNoLatLng}, InvalidCoords: ${skippedInvalidCoords}, NoTimestamp: ${skippedNoTimestamp}, Valid: ${locations.length}`);

  return locations;
}

export function parseGoogleTakeoutFile(jsonContent: string): ParsedLocation[] {
  try {
    const data = JSON.parse(jsonContent) as GoogleTimelineObject;
    
    // Log what keys exist in the file for debugging
    const topLevelKeys = Object.keys(data);
    console.log(`[Location Import] File contains keys: ${topLevelKeys.join(', ')}`);
    console.log(`[Location Import] timelineObjects: ${data.timelineObjects?.length ?? 0}`);
    console.log(`[Location Import] semanticSegments: ${data.semanticSegments?.length ?? 0}`);
    console.log(`[Location Import] rawSignals: ${data.rawSignals?.length ?? 0}`);
    
    const legacyLocations = parseLegacyTimelineFormat(data);
    console.log(`[Location Import] Parsed ${legacyLocations.length} legacy locations`);
    
    const semanticLocations = parseSemanticLocationFormat(data);
    console.log(`[Location Import] Parsed ${semanticLocations.length} semantic locations`);
    
    const rawSignalLocations = parseRawSignalsFormat(data);
    console.log(`[Location Import] Parsed ${rawSignalLocations.length} raw signal locations`);
    
    const allLocations = [...legacyLocations, ...semanticLocations, ...rawSignalLocations];
    console.log(`[Location Import] Total locations parsed: ${allLocations.length}`);
    
    allLocations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return allLocations;
  } catch (error) {
    console.error('Failed to parse Google Takeout file:', error);
    throw new Error('Invalid JSON format. Please ensure this is a valid Google Timeline export file.');
  }
}

export function convertToInsertLocation(
  userId: string,
  location: ParsedLocation,
  importBatchId: string
): InsertLocationHistory {
  return {
    userId,
    latitude: location.latitude,
    longitude: location.longitude,
    timestamp: location.timestamp,
    placeName: location.placeName,
    placeId: location.placeId,
    address: location.address,
    placeType: location.placeType,
    source: location.source,
    accuracyMeters: undefined,
    durationMinutes: location.durationMinutes,
    activityType: location.activityType,
    confidence: location.confidence,
    importBatchId,
  };
}

export interface LocationCluster {
  latitude: number;
  longitude: number;
  visits: Array<{
    timestamp: Date;
    durationMinutes?: number;
    placeName?: string;
    placeId?: string;
    address?: string;
  }>;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => deg * Math.PI / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}

export function clusterLocations(locations: LocationHistory[], radiusMeters: number = 100): LocationCluster[] {
  const clusters: LocationCluster[] = [];
  const processed = new Set<string>();

  for (const loc of locations) {
    if (processed.has(loc.id)) continue;

    const cluster: LocationCluster = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      visits: [{
        timestamp: loc.timestamp,
        durationMinutes: loc.durationMinutes ?? undefined,
        placeName: loc.placeName ?? undefined,
        placeId: loc.placeId ?? undefined,
        address: loc.address ?? undefined,
      }]
    };
    processed.add(loc.id);

    for (const other of locations) {
      if (processed.has(other.id)) continue;
      
      const distance = haversineDistance(loc.latitude, loc.longitude, other.latitude, other.longitude);
      if (distance <= radiusMeters) {
        cluster.visits.push({
          timestamp: other.timestamp,
          durationMinutes: other.durationMinutes ?? undefined,
          placeName: other.placeName ?? undefined,
          placeId: other.placeId ?? undefined,
          address: other.address ?? undefined,
        });
        processed.add(other.id);
      }
    }

    if (cluster.visits.length >= 2) {
      const totalLat = cluster.visits.reduce((sum, v) => {
        const matchingLoc = locations.find(l => l.timestamp.getTime() === v.timestamp.getTime());
        return sum + (matchingLoc?.latitude ?? cluster.latitude);
      }, 0);
      const totalLng = cluster.visits.reduce((sum, v) => {
        const matchingLoc = locations.find(l => l.timestamp.getTime() === v.timestamp.getTime());
        return sum + (matchingLoc?.longitude ?? cluster.longitude);
      }, 0);
      
      cluster.latitude = totalLat / cluster.visits.length;
      cluster.longitude = totalLng / cluster.visits.length;
    }

    clusters.push(cluster);
  }

  return clusters.sort((a, b) => b.visits.length - a.visits.length);
}

export function detectFrequentPlaces(
  clusters: LocationCluster[],
  userId: string,
  minVisits: number = 3
): InsertFrequentPlace[] {
  const frequentPlaces: InsertFrequentPlace[] = [];

  for (const cluster of clusters) {
    if (cluster.visits.length < minVisits) continue;

    const visits = cluster.visits.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const firstVisit = visits[0].timestamp;
    const lastVisit = visits[visits.length - 1].timestamp;
    
    const totalTime = visits.reduce((sum, v) => sum + (v.durationMinutes ?? 0), 0);
    const avgTime = Math.round(totalTime / visits.length);

    const dayCount: Record<string, number> = {};
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (const visit of visits) {
      const day = dayNames[visit.timestamp.getDay()];
      dayCount[day] = (dayCount[day] || 0) + 1;
    }
    const typicalDays = Object.entries(dayCount)
      .filter(([_, count]) => count >= visits.length * 0.3)
      .map(([day]) => day);

    const knownPlace = visits.find(v => v.placeName);
    const knownPlaceId = visits.find(v => v.placeId);
    const knownAddress = visits.find(v => v.address);

    let label: string | undefined;
    let category: string = 'other';
    
    const avgHour = visits.reduce((sum, v) => sum + v.timestamp.getHours(), 0) / visits.length;
    if (avgTime > 360 && typicalDays.length >= 4) {
      if (avgHour >= 6 && avgHour <= 10) {
        label = 'home';
        category = 'residential';
      } else if (avgHour >= 8 && avgHour <= 18) {
        label = 'work';
        category = 'workplace';
      }
    }

    frequentPlaces.push({
      userId,
      name: knownPlace?.placeName ?? `Location ${frequentPlaces.length + 1}`,
      label,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      radiusMeters: 100,
      placeId: knownPlaceId?.placeId,
      address: knownAddress?.address,
      category,
      visitCount: visits.length,
      totalTimeMinutes: totalTime,
      averageVisitMinutes: avgTime,
      lastVisit,
      firstVisit,
      typicalDays: typicalDays.length > 0 ? typicalDays : undefined,
      typicalTimeRange: undefined,
      isConfirmed: false,
      isHidden: false,
    });
  }

  return frequentPlaces;
}

export interface LocationPatterns {
  homeLocation?: FrequentPlace;
  workLocation?: FrequentPlace;
  frequentPlaces: FrequentPlace[];
  recentLocations: LocationHistory[];
  totalLocations: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export function buildLocationContext(
  frequentPlaces: FrequentPlace[],
  recentLocations: LocationHistory[],
  totalCount: number
): LocationPatterns {
  const homeLocation = frequentPlaces.find(p => p.label === 'home' && p.isConfirmed);
  const workLocation = frequentPlaces.find(p => p.label === 'work' && p.isConfirmed);
  
  const visiblePlaces = frequentPlaces.filter(p => !p.isHidden);
  
  let dateRange: { start: Date; end: Date } | undefined;
  if (recentLocations.length > 0) {
    const sorted = [...recentLocations].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    dateRange = {
      start: sorted[0].timestamp,
      end: sorted[sorted.length - 1].timestamp
    };
  }

  return {
    homeLocation,
    workLocation,
    frequentPlaces: visiblePlaces,
    recentLocations,
    totalLocations: totalCount,
    dateRange,
  };
}

export function formatLocationContextForAI(patterns: LocationPatterns): string {
  const lines: string[] = [];
  
  if (patterns.homeLocation) {
    lines.push(`Home: ${patterns.homeLocation.name}${patterns.homeLocation.address ? ` (${patterns.homeLocation.address})` : ''}`);
  }
  
  if (patterns.workLocation) {
    lines.push(`Work: ${patterns.workLocation.name}${patterns.workLocation.address ? ` (${patterns.workLocation.address})` : ''}`);
  }
  
  const otherPlaces = patterns.frequentPlaces
    .filter(p => p.label !== 'home' && p.label !== 'work')
    .slice(0, 5);
  
  if (otherPlaces.length > 0) {
    lines.push('\nFrequently visited places:');
    for (const place of otherPlaces) {
      const visits = place.visitCount ?? 0;
      const avgTime = place.averageVisitMinutes;
      let detail = `- ${place.name}`;
      if (visits > 0) detail += ` (${visits} visits`;
      if (avgTime && avgTime > 0) detail += `, avg ${avgTime} min`;
      if (visits > 0) detail += ')';
      lines.push(detail);
    }
  }

  const last7Days = patterns.recentLocations.filter(loc => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return loc.timestamp >= weekAgo;
  });

  if (last7Days.length > 0) {
    const uniquePlaces = new Set(last7Days.filter(l => l.placeName).map(l => l.placeName));
    if (uniquePlaces.size > 0) {
      lines.push(`\nRecent locations (past week): ${Array.from(uniquePlaces).slice(0, 5).join(', ')}`);
    }
  }

  if (patterns.dateRange) {
    const startStr = patterns.dateRange.start.toLocaleDateString();
    const endStr = patterns.dateRange.end.toLocaleDateString();
    lines.push(`\nLocation history available from ${startStr} to ${endStr} (${patterns.totalLocations} data points)`);
  }

  return lines.join('\n');
}
