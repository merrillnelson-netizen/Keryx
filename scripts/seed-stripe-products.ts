/**
 * Seed script to create Keryx subscription products in Stripe.
 * Run once: npx tsx scripts/seed-stripe-products.ts
 *
 * After running, copy the price IDs printed at the end and save them as:
 *   STRIPE_PRICE_PRO      → set in Replit Secrets
 *   STRIPE_PRICE_LIFE_OS  → set in Replit Secrets
 */

import { getUncachableStripeClient } from '../server/stripe-client';

async function main() {
  const stripe = await getUncachableStripeClient();

  // Check if products already exist
  const existing = await stripe.products.search({
    query: "name:'Keryx Pro' OR name:'Keryx Life OS'",
  });

  const existingNames = new Set(existing.data.map((p) => p.name));

  let proProductId: string;
  let lifeOsProductId: string;

  if (existingNames.has('Keryx Pro')) {
    const found = existing.data.find((p) => p.name === 'Keryx Pro')!;
    proProductId = found.id;
    console.log(`✓ Keryx Pro already exists: ${proProductId}`);
  } else {
    const pro = await stripe.products.create({
      name: 'Keryx Pro',
      description: 'Unlimited memories, AI briefings, semantic search, calendar & email integration, People manager, Goals, Reminders, Ideas workspace, Telegram.',
      metadata: { tier: 'pro' },
    });
    proProductId = pro.id;
    console.log(`✓ Created Keryx Pro: ${proProductId}`);
  }

  if (existingNames.has('Keryx Life OS')) {
    const found = existing.data.find((p) => p.name === 'Keryx Life OS')!;
    lifeOsProductId = found.id;
    console.log(`✓ Keryx Life OS already exists: ${lifeOsProductId}`);
  } else {
    const lifeOs = await stripe.products.create({
      name: 'Keryx Life OS',
      description: 'Everything in Pro, plus: Financial insights (Plaid), Contextual Discoveries, Meta Glasses companion, SMS & location import.',
      metadata: { tier: 'life_os' },
    });
    lifeOsProductId = lifeOs.id;
    console.log(`✓ Created Keryx Life OS: ${lifeOsProductId}`);
  }

  // Check for existing prices
  const proExistingPrices = await stripe.prices.list({ product: proProductId, active: true });
  const lifeOsExistingPrices = await stripe.prices.list({ product: lifeOsProductId, active: true });

  let proPriceId: string;
  let lifeOsPriceId: string;

  if (proExistingPrices.data.length > 0) {
    proPriceId = proExistingPrices.data[0].id;
    console.log(`✓ Keryx Pro price already exists: ${proPriceId}`);
  } else {
    const proPrice = await stripe.prices.create({
      product: proProductId,
      unit_amount: 1200,
      currency: 'usd',
      recurring: { interval: 'month' },
      nickname: 'Pro Monthly',
    });
    proPriceId = proPrice.id;
    console.log(`✓ Created Keryx Pro price ($12/mo): ${proPriceId}`);
  }

  if (lifeOsExistingPrices.data.length > 0) {
    lifeOsPriceId = lifeOsExistingPrices.data[0].id;
    console.log(`✓ Keryx Life OS price already exists: ${lifeOsPriceId}`);
  } else {
    const lifeOsPrice = await stripe.prices.create({
      product: lifeOsProductId,
      unit_amount: 2400,
      currency: 'usd',
      recurring: { interval: 'month' },
      nickname: 'Life OS Monthly',
    });
    lifeOsPriceId = lifeOsPrice.id;
    console.log(`✓ Created Keryx Life OS price ($24/mo): ${lifeOsPriceId}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('NEXT STEP: Save these price IDs as Replit Secrets');
  console.log('='.repeat(60));
  console.log(`STRIPE_PRICE_PRO=${proPriceId}`);
  console.log(`STRIPE_PRICE_LIFE_OS=${lifeOsPriceId}`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
