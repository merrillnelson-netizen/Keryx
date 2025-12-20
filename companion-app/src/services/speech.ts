/**
 * Speech Service
 * Handles speech-to-text and text-to-speech for voice interactions
 */

import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import Tts from 'react-native-tts';

type TranscriptCallback = (transcript: string, isFinal: boolean) => void;
type ErrorCallback = (error: string) => void;

class SpeechService {
  private isListening: boolean = false;
  private onTranscript?: TranscriptCallback;
  private onError?: ErrorCallback;

  async initialize(): Promise<void> {
    Voice.onSpeechResults = this.handleSpeechResults.bind(this);
    Voice.onSpeechPartialResults = this.handlePartialResults.bind(this);
    Voice.onSpeechError = this.handleSpeechError.bind(this);
    Voice.onSpeechEnd = this.handleSpeechEnd.bind(this);

    await Tts.setDefaultLanguage('en-US');
    await Tts.setDefaultRate(0.5);
    await Tts.setDefaultPitch(1.0);
  }

  async startListening(
    onTranscript: TranscriptCallback,
    onError?: ErrorCallback
  ): Promise<void> {
    if (this.isListening) {
      console.warn('Already listening');
      return;
    }

    this.onTranscript = onTranscript;
    this.onError = onError;

    try {
      await Voice.start('en-US');
      this.isListening = true;
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
      this.onError?.('Failed to start voice recognition');
      throw error;
    }
  }

  async stopListening(): Promise<string | null> {
    if (!this.isListening) {
      return null;
    }

    try {
      await Voice.stop();
      this.isListening = false;
      return null;
    } catch (error) {
      console.error('Failed to stop voice recognition:', error);
      throw error;
    }
  }

  async cancelListening(): Promise<void> {
    if (this.isListening) {
      await Voice.cancel();
      this.isListening = false;
    }
  }

  async speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const finishHandler = Tts.addEventListener('tts-finish', () => {
        finishHandler.remove();
        resolve();
      });

      const errorHandler = Tts.addEventListener('tts-error', (error) => {
        errorHandler.remove();
        reject(error);
      });

      Tts.speak(text);
    });
  }

  async stopSpeaking(): Promise<void> {
    await Tts.stop();
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  private handleSpeechResults(event: SpeechResultsEvent): void {
    if (event.value && event.value.length > 0) {
      this.onTranscript?.(event.value[0], true);
    }
  }

  private handlePartialResults(event: SpeechResultsEvent): void {
    if (event.value && event.value.length > 0) {
      this.onTranscript?.(event.value[0], false);
    }
  }

  private handleSpeechError(event: SpeechErrorEvent): void {
    console.error('Speech error:', event.error);
    this.isListening = false;
    this.onError?.(event.error?.message || 'Speech recognition error');
  }

  private handleSpeechEnd(): void {
    this.isListening = false;
  }

  async destroy(): Promise<void> {
    await Voice.destroy();
    Voice.removeAllListeners();
  }
}

export const speechService = new SpeechService();
