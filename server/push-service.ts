import webpush from 'web-push';
import { storage } from './storage';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:helix@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  type?: 'briefing' | 'alert' | 'plaid' | 'pattern' | 'reminder' | 'general';
  id?: string;
  tag?: string;
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
}

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await storage.getPushSubscriptions(userId);
  
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload)
      );

      await storage.updatePushSubscriptionLastUsed(sub.id);
      sent++;
    } catch (error: any) {
      console.error(`Push notification failed for subscription ${sub.id}:`, error.message);
      
      if (error.statusCode === 404 || error.statusCode === 410) {
        await storage.deletePushSubscription(sub.endpoint);
        console.log(`Removed expired subscription: ${sub.endpoint}`);
      }
      failed++;
    }
  }

  return { sent, failed };
}

export async function sendBriefingReminder(userId: string): Promise<void> {
  await sendPushNotification(userId, {
    title: 'Good Morning!',
    body: 'Your daily briefing is ready. Start your day with AI-powered insights.',
    url: '/',
    type: 'briefing',
    tag: 'morning-briefing',
    requireInteraction: false
  });
}

export async function sendPatternAlert(
  userId: string,
  patternTitle: string,
  patternBody: string
): Promise<void> {
  await sendPushNotification(userId, {
    title: patternTitle,
    body: patternBody,
    url: '/insights',
    type: 'pattern',
    tag: 'pattern-alert',
    requireInteraction: true
  });
}

export async function sendPlaidAlert(
  userId: string,
  alertTitle: string,
  alertBody: string
): Promise<void> {
  await sendPushNotification(userId, {
    title: alertTitle,
    body: alertBody,
    url: '/settings',
    type: 'plaid',
    tag: 'plaid-alert',
    requireInteraction: true,
    actions: [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });
}

export function getVapidPublicKey(): string | undefined {
  return VAPID_PUBLIC_KEY;
}
