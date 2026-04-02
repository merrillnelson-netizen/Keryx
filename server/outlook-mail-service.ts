/**
 * Outlook Mail Service for Microsoft Graph Mail Integration
 * Provides email operations via Microsoft Graph API using self-contained OAuth
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { getAccessToken as getOAuthAccessToken, hasValidToken } from './oauth-token-manager';

async function getAccessToken(userId: string): Promise<string> {
  const token = await getOAuthAccessToken(userId, 'microsoft');
  if (!token) throw new Error('Outlook Mail not connected');
  return token;
}

async function getOutlookMailClient(userId: string): Promise<Client> {
  const accessToken = await getAccessToken(userId);

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

/**
 * Check if Outlook Mail is connected and available
 */
export async function isOutlookMailConnected(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    return await hasValidToken(userId, 'microsoft');
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
export async function getOutlookUserEmail(userId: string): Promise<string | null> {
  try {
    const client = await getOutlookMailClient(userId);
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
export async function getOutlookRecentEmails(userId: string, maxResults: number = 10): Promise<OutlookEmailMessage[]> {
  try {
    const client = await getOutlookMailClient(userId);
    
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
export async function sendOutlookEmail(userId: string, params: SendOutlookEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = await getOutlookMailClient(userId);
    
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
export async function searchOutlookEmails(userId: string, query: string, maxResults: number = 10): Promise<OutlookEmailMessage[]> {
  try {
    const client = await getOutlookMailClient(userId);
    
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
