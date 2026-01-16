/**
 * Outlook Mail Service for Microsoft Graph Mail Integration
 * Provides email operations via Microsoft Graph API using Replit connector
 * 
 * Integration: outlook connector via Replit
 */

import { Client } from '@microsoft/microsoft-graph-client';

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

let outlookMailConnectionSettings: ReplitConnectorSettings | null = null;

async function getAccessToken(): Promise<string> {
  if (outlookMailConnectionSettings && 
      outlookMailConnectionSettings.settings?.expires_at && 
      outlookMailConnectionSettings.settings?.access_token &&
      new Date(outlookMailConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    return outlookMailConnectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Outlook Mail connection not available');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  outlookMailConnectionSettings = data.items?.[0];

  const accessToken = outlookMailConnectionSettings?.settings?.access_token || 
                      outlookMailConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!outlookMailConnectionSettings || !accessToken) {
    throw new Error('Outlook Mail not connected');
  }
  return accessToken;
}

async function getOutlookMailClient(): Promise<Client> {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

/**
 * Check if Outlook Mail is connected and available
 */
export async function isOutlookMailConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export interface OutlookEmailMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: string;
  to: string[];
  date: Date;
  snippet: string;
  body?: string;
  isRead: boolean;
}

export interface SendOutlookEmailParams {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

/**
 * Get user's Outlook email address
 */
export async function getOutlookUserEmail(): Promise<string | null> {
  try {
    const client = await getOutlookMailClient();
    const user = await client.api('/me').get();
    return user.mail || user.userPrincipalName || null;
  } catch (error) {
    console.error('Failed to get Outlook user email:', error);
    return null;
  }
}

/**
 * Fetch recent emails from inbox
 */
export async function getOutlookRecentEmails(maxResults: number = 10): Promise<OutlookEmailMessage[]> {
  try {
    const client = await getOutlookMailClient();
    
    const response = await client
      .api('/me/mailFolders/inbox/messages')
      .top(maxResults)
      .orderby('receivedDateTime desc')
      .select('id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead')
      .get();

    const messages = response.value || [];
    
    return messages.map((msg: any) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      subject: msg.subject || '(No Subject)',
      from: msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || '',
      to: msg.toRecipients?.map((r: any) => r.emailAddress?.address || r.emailAddress?.name || '').filter(Boolean) || [],
      date: new Date(msg.receivedDateTime),
      snippet: msg.bodyPreview || '',
      isRead: msg.isRead || false,
    }));
  } catch (error) {
    console.error('Failed to fetch Outlook emails:', error);
    return [];
  }
}

/**
 * Send an email via Outlook
 */
export async function sendOutlookEmail(params: SendOutlookEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = await getOutlookMailClient();
    
    const message = {
      subject: params.subject,
      body: {
        contentType: 'Text',
        content: params.body,
      },
      toRecipients: params.to.map(email => ({
        emailAddress: { address: email }
      })),
      ccRecipients: params.cc?.map(email => ({
        emailAddress: { address: email }
      })) || [],
      bccRecipients: params.bcc?.map(email => ({
        emailAddress: { address: email }
      })) || [],
    };

    await client.api('/me/sendMail').post({ message });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to send Outlook email:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

/**
 * Search emails by query
 */
export async function searchOutlookEmails(query: string, maxResults: number = 10): Promise<OutlookEmailMessage[]> {
  try {
    const client = await getOutlookMailClient();
    
    const response = await client
      .api('/me/messages')
      .filter(`contains(subject,'${query}') or contains(bodyPreview,'${query}')`)
      .top(maxResults)
      .orderby('receivedDateTime desc')
      .select('id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead')
      .get();

    const messages = response.value || [];
    
    return messages.map((msg: any) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      subject: msg.subject || '(No Subject)',
      from: msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || '',
      to: msg.toRecipients?.map((r: any) => r.emailAddress?.address || r.emailAddress?.name || '').filter(Boolean) || [],
      date: new Date(msg.receivedDateTime),
      snippet: msg.bodyPreview || '',
      isRead: msg.isRead || false,
    }));
  } catch (error) {
    console.error('Failed to search Outlook emails:', error);
    return [];
  }
}
