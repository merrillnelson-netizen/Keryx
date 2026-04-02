/**
 * Gmail Service for Google Mail Integration
 * Provides email operations via Gmail API using self-contained OAuth
 */

import { google, gmail_v1 } from 'googleapis';
import { getAccessToken as getOAuthAccessToken, hasValidToken } from './oauth-token-manager';

async function getAccessToken(userId: string): Promise<string> {
  const token = await getOAuthAccessToken(userId, 'google');
  if (!token) throw new Error('Gmail not connected');
  return token;
}

async function getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
  const accessToken = await getAccessToken(userId);

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Check if Gmail is connected and available
 */
export async function isGmailConnected(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    return await hasValidToken(userId, 'google');
  } catch {
    return false;
  }
}

// Track whether we've tested read permissions (per-user)
const gmailReadCapabilityCache = new Map<string, boolean>();

/**
 * Check Gmail capabilities (send vs read permissions)
 */
export async function getGmailCapabilities(userId?: string): Promise<{
  connected: boolean;
  canSend: boolean;
  canRead: boolean;
  message?: string;
}> {
  if (!userId) return { connected: false, canSend: false, canRead: false };
  try {
    const connected = await isGmailConnected(userId);
    if (!connected) {
      return { connected: false, canSend: false, canRead: false };
    }
    
    const canSend = true;
    
    if (!gmailReadCapabilityCache.has(userId)) {
      try {
        const gmail = await getGmailClient(userId);
        await gmail.users.messages.list({
          userId: 'me',
          maxResults: 1,
          labelIds: ['INBOX'],
        });
        gmailReadCapabilityCache.set(userId, true);
      } catch (error: any) {
        if (error?.status === 403 || error?.code === 403 || error?.message?.includes('Insufficient Permission')) {
          gmailReadCapabilityCache.set(userId, false);
        } else {
          gmailReadCapabilityCache.set(userId, true);
        }
      }
    }
    
    const canRead = gmailReadCapabilityCache.get(userId) ?? false;
    const message = canRead ? undefined : 'Gmail has send-only permissions.';
    
    return { connected, canSend, canRead, message };
  } catch {
    return { connected: false, canSend: false, canRead: false };
  }
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  date: Date;
  snippet: string;
  body?: string;
  labels: string[];
}

export interface SendEmailParams {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

/**
 * Get user's email address
 */
export async function getGmailUserEmail(userId: string): Promise<string | null> {
  try {
    const gmail = await getGmailClient(userId);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return profile.data.emailAddress || null;
  } catch (error) {
    console.error('Failed to get Gmail user email:', error);
    return null;
  }
}

/**
 * Fetch recent emails from inbox
 */
export async function getRecentEmails(userId: string, maxResults: number = 10): Promise<EmailMessage[]> {
  try {
    const gmail = await getGmailClient(userId);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
    });

    const messages = response.data.messages || [];
    const emails: EmailMessage[] = [];

    for (const msg of messages.slice(0, maxResults)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';

        emails.push({
          id: msg.id!,
          threadId: msg.threadId!,
          subject: getHeader('Subject'),
          from: getHeader('From'),
          to: getHeader('To').split(',').map(e => e.trim()),
          date: new Date(getHeader('Date')),
          snippet: detail.data.snippet || '',
          labels: detail.data.labelIds || [],
        });
      } catch (err) {
        console.warn(`Failed to fetch email ${msg.id}:`, err);
      }
    }

    return emails;
  } catch (error: any) {
    if (error?.status === 403 || error?.code === 403 || error?.message?.includes('Insufficient Permission')) {
      console.info('[Gmail] Read access not available (send-only permissions).');
      return [];
    }
    console.error('Failed to fetch recent emails:', error);
    return [];
  }
}

/**
 * Send an email via Gmail
 */
export async function sendEmail(userId: string, params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const gmail = await getGmailClient(userId);
    
    const emailLines = [
      `To: ${params.to.join(', ')}`,
      ...(params.cc ? [`Cc: ${params.cc.join(', ')}`] : []),
      ...(params.bcc ? [`Bcc: ${params.bcc.join(', ')}`] : []),
      `Subject: ${params.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      params.body,
    ];
    
    const rawEmail = Buffer.from(emailLines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawEmail },
    });

    return {
      success: true,
      messageId: response.data.id || undefined,
    };
  } catch (error: any) {
    console.error('Failed to send email:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

/**
 * Search emails by query
 */
export async function searchEmails(userId: string, query: string, maxResults: number = 10): Promise<EmailMessage[]> {
  try {
    const gmail = await getGmailClient(userId);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });

    const messages = response.data.messages || [];
    const emails: EmailMessage[] = [];

    for (const msg of messages.slice(0, maxResults)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';

        emails.push({
          id: msg.id!,
          threadId: msg.threadId!,
          subject: getHeader('Subject'),
          from: getHeader('From'),
          to: getHeader('To').split(',').map(e => e.trim()),
          date: new Date(getHeader('Date')),
          snippet: detail.data.snippet || '',
          labels: detail.data.labelIds || [],
        });
      } catch (err) {
        console.warn(`Failed to fetch email ${msg.id}:`, err);
      }
    }

    return emails;
  } catch (error) {
    console.error('Failed to search emails:', error);
    return [];
  }
}
