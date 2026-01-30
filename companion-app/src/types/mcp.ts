/**
 * MCP (Model Context Protocol) Types for Keryx Companion App
 * Matches the schema defined in shared/schema.ts
 */

export interface GeoContext {
  lat: number;
  lng: number;
  placeId?: string;
  placeName?: string;
  accuracyMeters?: number;
}

export interface DeviceContext {
  id: string;
  type: 'oakley-hstn' | 'meta-glasses' | 'phone' | 'web';
  connection?: 'bluetooth-sco' | 'bluetooth-a2dp' | 'usb' | 'wifi';
}

export interface AudioContext {
  scoSessionId?: string;
  format?: 'pcm-16' | 'opus';
  sampleRate?: number;
}

export interface MCPPayload {
  action: 'record' | 'query';
  transcript: string;
  geo?: GeoContext;
  device?: DeviceContext;
  audio?: AudioContext;
  metadata?: Record<string, unknown>;
}

export interface MCPResponse {
  status: 'success' | 'error';
  action: 'record' | 'query';
  data?: unknown;
  confirmation?: string;
  spokenResponse?: string;
  timestamp: string;
  errors?: Array<{ message: string }>;
}

export interface MemoryResult {
  id: string;
  memoryText: string;
  topicTag: string;
  timestamp: string;
  mood?: string;
  moodScore?: number;
  geoPlaceName?: string;
  similarity?: number;
}
