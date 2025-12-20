/**
 * Location Service
 * Handles GPS capture and reverse geocoding via Google Places API
 */

import Geolocation from '@react-native-community/geolocation';
import type { GeoContext } from '../types/mcp';

const GOOGLE_PLACES_API_KEY = ''; // Set via environment or config

interface PlaceResult {
  place_id: string;
  formatted_address: string;
  name?: string;
}

class LocationService {
  private apiKey: string = GOOGLE_PLACES_API_KEY;
  private lastKnownLocation: GeoContext | null = null;

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async getCurrentLocation(): Promise<GeoContext> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          const geo: GeoContext = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          };

          if (this.apiKey) {
            try {
              const place = await this.reverseGeocode(geo.lat, geo.lng);
              if (place) {
                geo.placeId = place.place_id;
                geo.placeName = place.name || place.formatted_address;
              }
            } catch (error) {
              console.warn('Reverse geocoding failed:', error);
            }
          }

          this.lastKnownLocation = geo;
          resolve(geo);
        },
        (error) => {
          console.error('Location error:', error);
          if (this.lastKnownLocation) {
            resolve(this.lastKnownLocation);
          } else {
            reject(error);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  }

  async reverseGeocode(lat: number, lng: number): Promise<PlaceResult | null> {
    if (!this.apiKey) return null;

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${this.apiKey}`
      );
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        return {
          place_id: result.place_id,
          formatted_address: result.formatted_address,
          name: result.formatted_address.split(',')[0],
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding API error:', error);
      return null;
    }
  }

  getLastKnownLocation(): GeoContext | null {
    return this.lastKnownLocation;
  }

  watchPosition(callback: (geo: GeoContext) => void): number {
    return Geolocation.watchPosition(
      async (position) => {
        const geo: GeoContext = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        };
        this.lastKnownLocation = geo;
        callback(geo);
      },
      (error) => console.warn('Watch position error:', error),
      {
        enableHighAccuracy: true,
        distanceFilter: 50,
      }
    );
  }

  clearWatch(watchId: number): void {
    Geolocation.clearWatch(watchId);
  }
}

export const locationService = new LocationService();
