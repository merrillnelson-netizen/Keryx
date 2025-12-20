/**
 * Helix API Service
 * Handles communication with the Helix backend
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MCPPayload, MCPResponse } from '../types/mcp';

const API_BASE_URL = __DEV__ 
  ? 'http://localhost:5000' 
  : 'https://your-helix-instance.replit.app';

class HelixApiService {
  private sessionCookie: string | null = null;

  async init(): Promise<void> {
    this.sessionCookie = await AsyncStorage.getItem('helix_session');
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      if (response.ok) {
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
          this.sessionCookie = setCookie;
          await AsyncStorage.setItem('helix_session', setCookie);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: this.getHeaders(),
        credentials: 'include',
      });
    } finally {
      this.sessionCookie = null;
      await AsyncStorage.removeItem('helix_session');
    }
  }

  async sendAction(payload: MCPPayload): Promise<MCPResponse> {
    const response = await fetch(`${API_BASE_URL}/api/companion/action`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  async recordMemory(
    transcript: string,
    geo?: MCPPayload['geo'],
    device?: MCPPayload['device']
  ): Promise<MCPResponse> {
    return this.sendAction({
      action: 'record',
      transcript,
      geo,
      device,
    });
  }

  async queryMemories(
    transcript: string,
    geo?: MCPPayload['geo'],
    device?: MCPPayload['device']
  ): Promise<MCPResponse> {
    return this.sendAction({
      action: 'query',
      transcript,
      geo,
      device,
    });
  }

  async checkAuth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
        headers: this.getHeaders(),
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.sessionCookie) {
      headers['Cookie'] = this.sessionCookie;
    }
    return headers;
  }
}

export const helixApi = new HelixApiService();
