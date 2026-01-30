/**
 * Wake Word Detection Service
 * Uses Picovoice Porcupine for "Hey Keryx" detection
 */

import {
  Porcupine,
  PorcupineManager,
  BuiltInKeywords,
} from '@picovoice/porcupine-react-native';

type WakeWordCallback = () => void;
type ErrorCallback = (error: Error) => void;

class WakeWordService {
  private porcupineManager: PorcupineManager | null = null;
  private isListening: boolean = false;
  private accessKey: string = ''; // Picovoice Access Key
  private customKeywordPath: string | null = null; // Path to custom "Hey Keryx" .ppn file

  setAccessKey(key: string): void {
    this.accessKey = key;
  }

  setCustomKeywordPath(path: string): void {
    this.customKeywordPath = path;
  }

  async start(
    onWakeWordDetected: WakeWordCallback,
    onError?: ErrorCallback
  ): Promise<void> {
    if (this.isListening) {
      console.warn('Wake word detection already running');
      return;
    }

    if (!this.accessKey) {
      throw new Error('Picovoice access key not set');
    }

    try {
      const detectionCallback = (keywordIndex: number): void => {
        console.log('Wake word detected! Index:', keywordIndex);
        onWakeWordDetected();
      };

      const processErrorCallback = (error: Error): void => {
        console.error('Porcupine error:', error);
        onError?.(error);
      };

      if (this.customKeywordPath) {
        this.porcupineManager = await PorcupineManager.fromKeywordPaths(
          this.accessKey,
          [this.customKeywordPath],
          detectionCallback,
          processErrorCallback
        );
      } else {
        this.porcupineManager = await PorcupineManager.fromBuiltInKeywords(
          this.accessKey,
          [BuiltInKeywords.COMPUTER],
          detectionCallback,
          processErrorCallback
        );
        console.warn(
          'Using fallback "Computer" keyword. Train custom "Hey Keryx" at console.picovoice.ai'
        );
      }

      await this.porcupineManager.start();
      this.isListening = true;
      console.log('Wake word detection started');
    } catch (error) {
      console.error('Failed to start wake word detection:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isListening || !this.porcupineManager) {
      return;
    }

    try {
      await this.porcupineManager.stop();
      await this.porcupineManager.delete();
      this.porcupineManager = null;
      this.isListening = false;
      console.log('Wake word detection stopped');
    } catch (error) {
      console.error('Failed to stop wake word detection:', error);
      throw error;
    }
  }

  isActive(): boolean {
    return this.isListening;
  }
}

export const wakeWordService = new WakeWordService();
