import OpenAI, { toFile } from "openai";
import { storage } from "./storage";
import { extractMetadata, generateEmbedding } from "./ai-service";

// Build timestamp: 2025-12-28T22:05:00Z - Force fresh deployment

/**
 * Get Telegram token dynamically from environment
 * Reads TELEGRAM_TOKEN at runtime (the original secret name from Replit integration)
 */
function getTelegramToken(): string | undefined {
  return process.env.TELEGRAM_TOKEN;
}

/**
 * Get Telegram API base URL
 */
function getTelegramApiBase(): string {
  return `https://api.telegram.org/bot${getTelegramToken()}`;
}

/**
 * Escape HTML special characters for safe Telegram message rendering
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const openai = new OpenAI({ 
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  // Only set baseURL when using Replit AI Integration
  ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
});

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
  voice?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_TOKEN;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!getTelegramToken()) {
    console.error('Telegram token not configured');
    return false;
  }

  try {
    const response = await fetch(`${getTelegramApiBase()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send Telegram message:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

export async function getFileUrl(fileId: string): Promise<string | null> {
  const token = getTelegramToken();
  if (!token) return null;

  try {
    const response = await fetch(`${getTelegramApiBase()}/getFile?file_id=${fileId}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.ok || !data.result?.file_path) return null;

    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  } catch (error) {
    console.error('Error getting file URL:', error);
    return null;
  }
}

export async function transcribeVoiceNote(fileUrl: string): Promise<string | null> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.error('Failed to download voice note');
      return null;
    }

    // Use OpenAI's toFile helper for Node.js compatibility
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const audioFile = await toFile(audioBuffer, 'voice.ogg', { type: 'audio/ogg' });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    return transcription.text;
  } catch (error) {
    console.error('Error transcribing voice note:', error);
    return null;
  }
}

export async function findUserByChatId(chatId: string): Promise<{ userId: string } | null> {
  const userSettings = await storage.findSettingsByTelegramChatId(chatId);
  if (!userSettings) return null;
  return { userId: userSettings.userId };
}

export async function findUserByVerificationCode(code: string): Promise<{ userId: string; settingsId: string } | null> {
  const userSettings = await storage.findSettingsByTelegramVerificationCode(code);
  if (!userSettings) return null;
  if (userSettings.telegramVerificationExpires && new Date(userSettings.telegramVerificationExpires) < new Date()) {
    return null;
  }
  return { userId: userSettings.userId, settingsId: userSettings.id };
}

export async function handleTelegramWebhook(update: TelegramUpdate): Promise<{ success: boolean; response?: string }> {
  if (!update.message) {
    return { success: true };
  }

  const message = update.message;
  const chatId = String(message.chat.id);
  const text = message.text;

  if (text?.startsWith('/start')) {
    const code = text.split(' ')[1];
    if (code) {
      // Rate limit verification attempts to prevent brute force
      if (isVerificationRateLimited(chatId)) {
        await sendTelegramMessage(chatId, 
          `⚠️ Too many verification attempts. Please wait 5 minutes and try again.`
        );
        return { success: false, response: 'Rate limited' };
      }

      const userMatch = await findUserByVerificationCode(code);
      if (userMatch) {
        // Clear rate limit on successful verification
        clearVerificationAttempts(chatId);
        
        // One-time use: immediately clear the verification code
        await storage.updateSettings(userMatch.userId, {
          telegramChatId: chatId,
          telegramEnabled: true,
          telegramVerificationCode: null,
          telegramVerificationExpires: null,
        });

        await sendTelegramMessage(chatId, 
          `🎉 <b>Successfully connected!</b>\n\nYour Telegram is now linked to Keryx. You can:\n\n` +
          `📝 Send text messages to record memories\n` +
          `🎤 Send voice notes to record memories\n` +
          `🔍 Ask questions about your memories\n\n` +
          `Try it now - just send a message!`
        );
        return { success: true, response: 'Account linked' };
      } else {
        await sendTelegramMessage(chatId, 
          `❌ Invalid or expired verification code.\n\nPlease generate a new code in Keryx Settings → Telegram.`
        );
        return { success: true, response: 'Invalid code' };
      }
    } else {
      await sendTelegramMessage(chatId, 
        `👋 <b>Welcome to Keryx!</b>\n\n` +
        `To connect your account, go to Keryx Settings → Telegram and click "Connect Telegram".`
      );
      return { success: true, response: 'Welcome message sent' };
    }
  }

  const user = await findUserByChatId(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, 
      `🔗 <b>Account not linked</b>\n\n` +
      `Please connect your Telegram in Keryx Settings → Telegram first.`
    );
    return { success: true, response: 'User not linked' };
  }

  let transcriptText: string | null = null;

  if (message.voice) {
    await sendTelegramMessage(chatId, '🎤 Processing your voice note...');
    
    const fileUrl = await getFileUrl(message.voice.file_id);
    if (!fileUrl) {
      await sendTelegramMessage(chatId, '❌ Could not download voice note. Please try again.');
      return { success: false, response: 'File download failed' };
    }

    transcriptText = await transcribeVoiceNote(fileUrl);
    if (!transcriptText) {
      await sendTelegramMessage(chatId, '❌ Could not transcribe voice note. Please try again.');
      return { success: false, response: 'Transcription failed' };
    }
  } else if (text && !text.startsWith('/')) {
    transcriptText = text;
  }

  if (transcriptText) {
    try {
      const [extracted, embeddingVector] = await Promise.all([
        extractMetadata(transcriptText),
        generateEmbedding(transcriptText),
      ]);

      const logEntry = await storage.createLogEntry({
        userId: user.userId,
        memoryText: transcriptText,
        topicTag: extracted.topicTag,
        metadataJson: extracted.metadataJson,
        embeddingVector,
        mood: extracted.mood,
        moodScore: extracted.moodScore,
        detectedPeople: extracted.detectedPeople,
        deviceType: 'phone',
        deviceConnection: 'direct',
        aiReasoning: extracted.aiReasoning,
      });

      if (extracted.detectedPeople && extracted.detectedPeople.length > 0) {
        Promise.all(
          extracted.detectedPeople.map(name => storage.upsertPerson(user.userId, name))
        ).catch(err => console.error("Failed to track people:", err));
      }

      // Escape all dynamic content for HTML safety
      const safeText = escapeHtml(transcriptText.substring(0, 100));
      const safeTopic = extracted.topicTag ? escapeHtml(extracted.topicTag) : '';
      const safeMood = extracted.mood ? escapeHtml(extracted.mood) : '';
      const safePeople = extracted.detectedPeople?.map(p => escapeHtml(p)) || [];

      let responseMessage = `✅ <b>Memory saved!</b>\n\n`;
      responseMessage += `📝 "${safeText}${transcriptText.length > 100 ? '...' : ''}"\n\n`;
      
      if (safeTopic) {
        responseMessage += `🏷️ Topic: ${safeTopic}\n`;
      }
      if (safeMood) {
        const moodEmoji = getMoodEmoji(extracted.mood!);
        responseMessage += `${moodEmoji} Mood: ${safeMood}`;
        if (extracted.moodScore !== undefined) {
          responseMessage += ` (${extracted.moodScore > 0 ? '+' : ''}${extracted.moodScore})`;
        }
        responseMessage += '\n';
      }
      if (safePeople.length > 0) {
        responseMessage += `👥 People: ${safePeople.join(', ')}\n`;
      }

      await sendTelegramMessage(chatId, responseMessage);
      return { success: true, response: 'Memory saved' };

    } catch (error) {
      console.error('Error processing memory from Telegram:', error);
      await sendTelegramMessage(chatId, '❌ Something went wrong. Please try again later.');
      return { success: false, response: 'Processing error' };
    }
  }

  return { success: true };
}

function getMoodEmoji(mood: string): string {
  const moodEmojis: Record<string, string> = {
    happy: '😊',
    excited: '🎉',
    hopeful: '🌟',
    neutral: '😐',
    anxious: '😰',
    sad: '😢',
    frustrated: '😤',
    angry: '😠',
  };
  return moodEmojis[mood.toLowerCase()] || '🙂';
}

// Rate limiting for verification attempts (per chatId)
const verificationAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_VERIFICATION_ATTEMPTS = 5;
const VERIFICATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function isVerificationRateLimited(chatId: string): boolean {
  const now = Date.now();
  const record = verificationAttempts.get(chatId);
  
  if (!record) {
    verificationAttempts.set(chatId, { count: 1, firstAttempt: now });
    return false;
  }
  
  // Reset if window has passed
  if (now - record.firstAttempt > VERIFICATION_WINDOW_MS) {
    verificationAttempts.set(chatId, { count: 1, firstAttempt: now });
    return false;
  }
  
  // Increment and check limit
  record.count++;
  return record.count > MAX_VERIFICATION_ATTEMPTS;
}

function clearVerificationAttempts(chatId: string): void {
  verificationAttempts.delete(chatId);
}

export async function generateVerificationCode(): Promise<string> {
  // Use high-entropy code: 12 characters alphanumeric (excluding ambiguous chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const crypto = await import('crypto');
  let code = '';
  for (let i = 0; i < 12; i++) {
    const randomByte = crypto.randomBytes(1)[0];
    code += chars.charAt(randomByte % chars.length);
  }
  return code;
}

export async function setWebhook(webhookUrl: string): Promise<boolean> {
  if (!getTelegramToken()) {
    console.error('Telegram token not configured');
    return false;
  }

  try {
    // Include secret token for webhook validation if configured
    const webhookPayload: Record<string, any> = {
      url: webhookUrl,
      allowed_updates: ['message'],
    };
    
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      webhookPayload.secret_token = webhookSecret;
    }

    const response = await fetch(`${getTelegramApiBase()}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to set webhook:', error);
      return false;
    }

    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error('Error setting webhook:', error);
    return false;
  }
}

export async function sendBriefingToTelegram(userId: string, briefingHtml: string): Promise<boolean> {
  const userSettings = await storage.getSettings(userId);
  if (!userSettings?.telegramEnabled || !userSettings?.telegramBriefingsEnabled || !userSettings?.telegramChatId) {
    return false;
  }

  return sendTelegramMessage(userSettings.telegramChatId, `☀️ <b>Good Morning!</b>\n\n${briefingHtml}`);
}

export async function sendAlertToTelegram(userId: string, alertHtml: string): Promise<boolean> {
  const userSettings = await storage.getSettings(userId);
  if (!userSettings?.telegramEnabled || !userSettings?.telegramAlertsEnabled || !userSettings?.telegramChatId) {
    return false;
  }

  return sendTelegramMessage(userSettings.telegramChatId, `⚠️ <b>Pattern Alert</b>\n\n${alertHtml}`);
}
