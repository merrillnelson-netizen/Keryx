/**
 * Gmail Service for Google Mail Integration
 * Provides email operations via Gmail API using Replit connector
 * 
 * Integration: google-mail connector via Replit
 */

import { google, gmail_v1 } from 'googleapis';

interface ReplitConnectorSettings {
  settings?: {
    access_token?: string;
    expires_at?: string;
    oauth?: {
      credentials?: {
        access_token?: string;
      };
    };
  };
}

let gmailConnectionSettings: ReplitConnectorSettings | null = null;

async function getAccessToken(): Promise<string> {
  if (gmailConnectionSettings && 
      gmailConnectionSettings.settings?.expires_at && 
      gmailConnectionSettings.settings?.access_token &&
      new Date(gmailConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    return gmailConnectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Gmail connection not available');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  gmailConnectionSettings = data.items?.[0];

  const accessToken = gmailConnectionSettings?.settings?.access_token || 
                      gmailConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!gmailConnectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Check if Gmail is connected and available
 */
export async function isGmailConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

// Track whether we've tested read permissions
let gmailReadCapabilityTested = false;
let gmailCanRead = false;

/**
 * Check Gmail capabilities (send vs read permissions)
 * Returns detailed capability info based on actual OAuth scopes
 */
export async function getGmailCapabilities(): Promise<{
  connected: boolean;
  canSend: boolean;
  canRead: boolean;
  message?: string;
}> {
  try {
    const connected = await isGmailConnected();
    if (!connected) {
      return { connected: false, canSend: false, canRead: false };
    }
    
    // Gmail send is always available with the connector
    const canSend = true;
    
    // Test read capability if not already tested
    if (!gmailReadCapabilityTested) {
      try {
        const gmail = await getGmailClient();
        await gmail.users.messages.list({
          userId: 'me',
          maxResults: 1,
          labelIds: ['INBOX'],
        });
        gmailCanRead = true;
      } catch (error: any) {
        if (error?.status === 403 || error?.code === 403 || error?.message?.includes('Insufficient Permission')) {
          gmailCanRead = false;
        }
      }
      gmailReadCapabilityTested = true;
    }
    
    const message = gmailCanRead 
      ? undefined 
      : 'Gmail has send-only permissions. Email reading uses Outlook.';
    
    return { connected, canSend, canRead: gmailCanRead, message };
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
export async function getGmailUserEmail(): Promise<string | null> {
  try {
    const gmail = await getGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return profile.data.emailAddress || null;
  } catch (error) {
    console.error('Failed to get Gmail user email:', error);
    return null;
  }
}

let gmailReadPermissionWarned = false;

/**
 * Fetch recent emails from inbox
 * Note: Gmail connector may have send-only permissions, in which case this returns empty array
 */
export async function getRecentEmails(maxResults: number = 10): Promise<EmailMessage[]> {
  try {
    const gmail = await getGmailClient();
    
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
      if (!gmailReadPermissionWarned) {
        console.info('[Gmail] Read access not available (send-only permissions). Using Outlook Mail for email features.');
        gmailReadPermissionWarned = true;
      }
      return [];
    }
    console.error('Failed to fetch recent emails:', error);
    return [];
  }
}

/**
 * Send an email via Gmail
 */
export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const gmail = await getGmailClient();
    
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
      requestBody: {
        raw: rawEmail,
      },
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
export async function searchEmails(query: string, maxResults: number = 10): Promise<EmailMessage[]> {
  try {
    const gmail = await getGmailClient();
    
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
