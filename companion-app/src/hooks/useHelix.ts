/**
 * useHelix Hook
 * Main React hook for Helix companion app functionality
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { helixApi } from '../services/api';
import { wakeWordService } from '../services/wakeWord';
import { speechService } from '../services/speech';
import { bluetoothService } from '../services/bluetooth';
import { locationService } from '../services/location';
import { actionRouter, ActionType } from '../services/actionRouter';
import type { DeviceContext, GeoContext, MCPResponse } from '../types/mcp';

export type HelixState = 
  | 'idle'
  | 'listening-wake'
  | 'listening-command'
  | 'processing'
  | 'speaking'
  | 'error';

interface HelixStatus {
  state: HelixState;
  isAuthenticated: boolean;
  isGlassesConnected: boolean;
  deviceContext: DeviceContext | null;
  lastLocation: GeoContext | null;
  lastTranscript: string;
  lastAction: ActionType | null;
  lastResponse: MCPResponse | null;
  error: string | null;
}

interface UseHelixReturn extends HelixStatus {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  processCommand: (transcript: string) => Promise<void>;
  connectGlasses: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export function useHelix(): UseHelixReturn {
  const [state, setState] = useState<HelixState>('idle');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGlassesConnected, setIsGlassesConnected] = useState(false);
  const [deviceContext, setDeviceContext] = useState<DeviceContext | null>(null);
  const [lastLocation, setLastLocation] = useState<GeoContext | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastAction, setLastAction] = useState<ActionType | null>(null);
  const [lastResponse, setLastResponse] = useState<MCPResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const locationWatchId = useRef<number | null>(null);

  useEffect(() => {
    initializeServices();
    return () => cleanup();
  }, []);

  const initializeServices = async () => {
    try {
      await helixApi.init();
      const authed = await helixApi.checkAuth();
      setIsAuthenticated(authed);

      await speechService.initialize();
      await bluetoothService.initialize();

      bluetoothService.setConnectionCallbacks(
        (device) => {
          setIsGlassesConnected(true);
          setDeviceContext(device);
        },
        () => {
          setIsGlassesConnected(false);
          setDeviceContext(null);
        }
      );

      locationWatchId.current = locationService.watchPosition((geo) => {
        setLastLocation(geo);
      });
    } catch (err) {
      console.error('Failed to initialize services:', err);
      setError('Failed to initialize app services');
    }
  };

  const cleanup = () => {
    wakeWordService.stop();
    speechService.destroy();
    if (locationWatchId.current !== null) {
      locationService.clearWatch(locationWatchId.current);
    }
  };

  const startListening = useCallback(async () => {
    try {
      setState('listening-wake');
      setError(null);

      await wakeWordService.start(
        async () => {
          await onWakeWordDetected();
        },
        (err) => {
          setError(err.message);
          setState('error');
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start listening');
      setState('error');
    }
  }, []);

  const onWakeWordDetected = async () => {
    setState('listening-command');
    
    await speechService.speak('Yes?');

    await speechService.startListening(
      async (transcript, isFinal) => {
        setLastTranscript(transcript);
        if (isFinal) {
          await processCommand(transcript);
        }
      },
      (err) => {
        setError(err);
        setState('listening-wake');
      }
    );
  };

  const stopListening = useCallback(async () => {
    await wakeWordService.stop();
    await speechService.cancelListening();
    setState('idle');
  }, []);

  const processCommand = useCallback(async (transcript: string) => {
    setState('processing');
    setLastTranscript(transcript);

    const result = await actionRouter.processVoiceCommand(transcript);

    setLastAction(result.action);
    if (result.response) {
      setLastResponse(result.response);
    }

    if (!result.success) {
      setError(result.error || 'Command processing failed');
    }

    setState('listening-wake');
  }, []);

  const connectGlasses = useCallback(async () => {
    try {
      const devices = await bluetoothService.getPairedDevices();
      if (devices.length > 0) {
        const context = await bluetoothService.connectToDevice(devices[0]);
        setDeviceContext(context);
        setIsGlassesConnected(true);
      } else {
        setError('No compatible glasses found. Please pair your glasses first.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to glasses');
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const success = await helixApi.login(username, password);
    setIsAuthenticated(success);
    return success;
  }, []);

  const logout = useCallback(async () => {
    await helixApi.logout();
    setIsAuthenticated(false);
  }, []);

  return {
    state,
    isAuthenticated,
    isGlassesConnected,
    deviceContext,
    lastLocation,
    lastTranscript,
    lastAction,
    lastResponse,
    error,
    startListening,
    stopListening,
    processCommand,
    connectGlasses,
    login,
    logout,
  };
}
