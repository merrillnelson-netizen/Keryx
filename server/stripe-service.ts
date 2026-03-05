import Stripe from 'stripe';
import { storage } from './storage';

let _stripeInstance: Stripe | null = null;

function getStripeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripeInstance) {
    _stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    });
  }
  return _stripeInstance;
}

export function isStripeConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_PRO &&
    process.env.STRIPE_PRICE_LIFE_OS
  );
}

function getTierFromPriceId(priceId: string): 'pro' | 'life_os' | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_LIFE_OS) return 'life_os';
  return null;
}

async function resolveUserIdFromCustomer(stripeCustomerId: string): Promise<string | undefined> {
  try {
    const user = await storage.getUserByStripeCustomerId(stripeCustomerId);
    return user?.id;
  } catch {
    return undefined;
  }
}

export async function getOrCreateCustomer(userId: string, username: string): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured');

  const user = await storage.getUser(userId);
  if (!user) throw new Error('User not found');

  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: username.includes('@') ? username : undefined,
    name: username,
    metadata: { userId },
  });

  await storage.updateUser(userId, { stripeCustomerId: customer.id });
  return customer.id;
}

export async function createCheckoutSession({
  userId,
  username,
  priceId,
  successUrl,
  cancelUrl,
}: {
  userId: string;
  username: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured');

  const customerId = await getOrCreateCustomer(userId, username);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId } },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

export async function createPortalSession(stripeCustomerId: string, returnUrl: string): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured');

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

export async function handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured');
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not set');

  const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price?.id;
      const tier = priceId ? getTierFromPriceId(priceId) : null;
      if (!tier) break;

      const userId = sub.metadata?.userId || (await resolveUserIdFromCustomer(sub.customer as string));
      if (!userId) break;

      // In Stripe API 2026, current_period_end lives on the subscription item
      const periodEnd = sub.items.data[0]?.current_period_end;
      await storage.updateUser(userId, {
        subscriptionTier: tier,
        subscriptionStatus: sub.status as string,
        stripeSubscriptionId: sub.id,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId || (await resolveUserIdFromCustomer(sub.customer as string));
      if (!userId) break;

      await storage.updateUser(userId, {
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const userId = await resolveUserIdFromCustomer(invoice.customer as string);
      if (!userId) break;
      await storage.updateUser(userId, { subscriptionStatus: 'past_due' });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const userId = await resolveUserIdFromCustomer(invoice.customer as string);
      if (!userId) break;
      // Status update only — period end is refreshed via the subscription.updated event
      // which fires simultaneously with invoice.payment_succeeded on renewal
      await storage.updateUser(userId, { subscriptionStatus: 'active' });
      break;
    }
  }
}
