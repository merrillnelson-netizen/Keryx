import { useState, useEffect, useCallback, useRef } from "react";

interface GeolocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  placeName: string | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

interface UseGeolocationReturn extends GeolocationState {
  requestLocation: () => Promise<GeolocationState>;
  isSupported: boolean;
  permissionStatus: PermissionState | null;
}

const CACHE_DURATION_MS = 60000;

export function useGeolocation(): UseGeolocationReturn {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    placeName: null,
    isLoading: false,
    error: null,
    lastUpdated: null,
  });
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);
  
  const cacheRef = useRef<GeolocationState | null>(null);

  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!isSupported) return;

    navigator.permissions?.query({ name: 'geolocation' }).then((result) => {
      setPermissionStatus(result.state);
      result.onchange = () => setPermissionStatus(result.state);
    }).catch(() => {
      // permissions API not supported, but geolocation may still work
    });
  }, [isSupported]);

  const requestLocation = useCallback(async (): Promise<GeolocationState> => {
    if (!isSupported) {
      const errorState: GeolocationState = {
        ...state,
        error: 'Geolocation is not supported by your browser',
        isLoading: false,
      };
      setState(errorState);
      return errorState;
    }

    if (cacheRef.current && cacheRef.current.lastUpdated) {
      const cacheAge = Date.now() - cacheRef.current.lastUpdated.getTime();
      if (cacheAge < CACHE_DURATION_MS) {
        setState(cacheRef.current);
        return cacheRef.current;
      }
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const newState: GeolocationState = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            placeName: null,
            isLoading: false,
            error: null,
            lastUpdated: new Date(),
          };

          cacheRef.current = newState;
          setState(newState);
          resolve(newState);
        },
        (error) => {
          let errorMessage = 'Failed to get location';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              break;
          }

          const errorState: GeolocationState = {
            ...state,
            error: errorMessage,
            isLoading: false,
          };
          setState(errorState);
          resolve(errorState);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: CACHE_DURATION_MS,
        }
      );
    });
  }, [isSupported, state]);

  return {
    ...state,
    requestLocation,
    isSupported,
    permissionStatus,
  };
}
