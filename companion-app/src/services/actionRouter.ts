/**
 * Action Router Service
 * Central coordinator for voice commands - routes to record or query actions
 */

import { helixApi } from './api';
import { locationService } from './location';
import { bluetoothService } from './bluetooth';
import { speechService } from './speech';
import type { MCPResponse, GeoContext, DeviceContext } from '../types/mcp';

export type ActionType = 'record' | 'query' | 'unknown';

interface ActionResult {
  success: boolean;
  action: ActionType;
  response?: MCPResponse;
  spokenFeedback: string;
  error?: string;
}

const QUERY_KEYWORDS = [
  'what',
  'when',
  'where',
  'who',
  'how',
  'find',
  'search',
  'show',
  'tell me',
  'remind me',
  'did i',
  'have i',
  'do i have',
  'last time',
  'remember',
];

const RECORD_KEYWORDS = [
  'remember',
  'note',
  'save',
  'log',
  'record',
  'i just',
  'i am',
  "i'm",
  'today i',
  'just had',
  'just met',
];

class ActionRouter {
  async processVoiceCommand(transcript: string): Promise<ActionResult> {
    const action = this.classifyIntent(transcript);
    const geo = await this.getLocationContext();
    const device = bluetoothService.getDeviceContext() || this.getPhoneContext();

    try {
      let response: MCPResponse;
      let spokenFeedback: string;

      if (action === 'query') {
        response = await helixApi.queryMemories(transcript, geo, device);
        spokenFeedback = response.spokenResponse || 'No results found.';
      } else {
        response = await helixApi.recordMemory(transcript, geo, device);
        spokenFeedback = response.confirmation || 'Memory saved.';
      }

      await speechService.speak(spokenFeedback);

      return {
        success: true,
        action,
        response,
        spokenFeedback,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      const spokenFeedback = 'Sorry, I could not process that. Please try again.';
      
      await speechService.speak(spokenFeedback);

      return {
        success: false,
        action,
        spokenFeedback,
        error: errorMessage,
      };
    }
  }

  classifyIntent(transcript: string): ActionType {
    const lowerTranscript = transcript.toLowerCase().trim();

    const queryScore = QUERY_KEYWORDS.reduce((score, keyword) => {
      return score + (lowerTranscript.includes(keyword) ? 1 : 0);
    }, 0);

    const recordScore = RECORD_KEYWORDS.reduce((score, keyword) => {
      return score + (lowerTranscript.includes(keyword) ? 1 : 0);
    }, 0);

    if (lowerTranscript.endsWith('?')) {
      return 'query';
    }

    if (queryScore > recordScore) {
      return 'query';
    }

    if (recordScore > 0 || queryScore === 0) {
      return 'record';
    }

    return 'record';
  }

  private async getLocationContext(): Promise<GeoContext | undefined> {
    try {
      return await locationService.getCurrentLocation();
    } catch (error) {
      console.warn('Could not get location:', error);
      return locationService.getLastKnownLocation() || undefined;
    }
  }

  private getPhoneContext(): DeviceContext {
    return {
      id: 'phone-companion',
      type: 'phone',
      connection: 'wifi',
    };
  }
}

export const actionRouter = new ActionRouter();
