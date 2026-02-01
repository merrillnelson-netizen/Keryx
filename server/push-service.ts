import webpush from 'web-push';
import { storage } from './storage';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

let pushConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      'mailto:support@keryx.app',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    pushConfigured = true;
    console.log('[push-service] Web push configured successfully');
  } catch (error) {
    console.error('[push-service] Failed to configure web push:', error);
  }
} else {
  console.warn('[push-service] VAPID keys not configured - push notifications disabled');
}

export function isPushConfigured(): boolean {
  return pushConfigured;
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  requireInteraction?: boolean;
}

export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!pushConfigured) {
    return { sent: 0, failed: 0, errors: ['Push notifications not configured'] };
  }

  const subscriptions = await storage.getPushSubscriptions(userId);
  
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
    tag: payload.tag,
    data: payload.data,
    actions: payload.actions,
    requireInteraction: payload.requireInteraction,
  });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        notificationPayload
      );
      sent++;
      
      // Update last used in background
      storage.updatePushSubscriptionLastUsed(subscription.id).catch(() => {});
    } catch (error: unknown) {
      failed++;
      const err = error as { statusCode?: number; message?: string };
      
      // Remove invalid subscriptions (gone or expired)
      if (err.statusCode === 404 || err.statusCode === 410) {
        await storage.deletePushSubscription(subscription.endpoint).catch(() => {});
      } else {
        errors.push(err.message || 'Unknown error');
      }
    }
  }

  return { sent, failed, errors };
}

export async function sendPushToAllUserDevices(
  userId: string,
  notification: {
    type: 'briefing' | 'alert' | 'reminder' | 'discovery' | 'action_required' | 'test';
    title: string;
    body: string;
    url?: string;
    requireInteraction?: boolean;
  }
): Promise<{ sent: number; failed: number }> {
  const payload: PushPayload = {
    title: notification.title,
    body: notification.body,
    tag: notification.type,
    requireInteraction: notification.requireInteraction ?? notification.type === 'action_required',
    data: {
      type: notification.type,
      url: notification.url || '/',
      timestamp: Date.now(),
    },
  };

  // Add appropriate actions based on type
  if (notification.type === 'briefing') {
    payload.actions = [
      { action: 'view', title: 'View Briefing' },
      { action: 'dismiss', title: 'Dismiss' },
    ];
  } else if (notification.type === 'action_required') {
    payload.actions = [
      { action: 'review', title: 'Review' },
      { action: 'later', title: 'Later' },
    ];
  }

  const result = await sendPushNotification(userId, payload);
  return { sent: result.sent, failed: result.failed };
}
