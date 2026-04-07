#!/usr/bin/env node
/**
 * Stripe v22 upgrade verification test.
 *
 * Run with a Stripe TEST key:
 *   STRIPE_SECRET_KEY=sk_test_... node /tmp/test-stripe-upgrade.js
 *
 * Exercises the exact API calls used by our Netlify functions:
 *   1. stripe.customers.create()
 *   2. stripe.checkout.sessions.create() with line_items + customer
 *   3. Verifies the returned session has the expected shape
 *
 * Does NOT hit Supabase, does NOT charge a card — it only verifies that
 * the Stripe SDK call surface we rely on works on v22.
 */

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Set STRIPE_SECRET_KEY (use sk_test_...) and re-run');
  process.exit(1);
}
if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  console.error('REFUSING TO RUN: STRIPE_SECRET_KEY must be a test key (sk_test_...)');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const Stripe_pkg = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'node_modules/stripe/package.json'),
  'utf8'
).match(/"version":\s*"([^"]+)"/)[1];

(async () => {
  console.log(`\nStripe SDK version: ${Stripe_pkg}\n`);

  // Step 1: Create a test customer (mirrors create-checkout.js line ~87)
  console.log('1. Creating test customer...');
  const customer = await stripe.customers.create({
    email: `test-upgrade-${Date.now()}@example.com`,
    metadata: { source: 'stripe-upgrade-test', test: 'true' },
  });
  console.log(`   ✓ Customer created: ${customer.id}`);

  // Step 2: Create a Checkout Session (exact pattern from create-checkout.js)
  console.log('2. Creating checkout session...');
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customer.id,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Test: ProposalPulse Assessment',
          description: 'Stripe v22 upgrade verification',
        },
        unit_amount: 1999,
      },
      quantity: 1,
    }],
    success_url: 'https://missionmeetstech.com/proposal-pulse.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://missionmeetstech.com/proposal-pulse.html',
    metadata: { test: 'true' },
  });
  console.log(`   ✓ Session created: ${session.id}`);
  console.log(`   ✓ Session URL: ${session.url.slice(0, 60)}...`);

  // Step 3: Verify the session shape matches what the frontend expects
  console.log('3. Verifying session response shape...');
  const requiredFields = ['id', 'url', 'customer', 'amount_total', 'currency'];
  for (const field of requiredFields) {
    if (session[field] === undefined) {
      console.error(`   ✗ Missing field: ${field}`);
      process.exit(1);
    }
  }
  console.log(`   ✓ All required fields present`);
  console.log(`   ✓ amount_total: ${session.amount_total} ${session.currency}`);

  // Step 4: Verify webhook.constructEvent signature (static check, not a real webhook)
  console.log('4. Verifying webhook.constructEvent exists...');
  if (typeof stripe.webhooks.constructEvent !== 'function') {
    console.error('   ✗ stripe.webhooks.constructEvent is not a function');
    process.exit(1);
  }
  console.log(`   ✓ stripe.webhooks.constructEvent ready`);

  // Cleanup
  console.log('5. Cleaning up...');
  await stripe.customers.del(customer.id);
  console.log(`   ✓ Test customer deleted`);

  console.log('\n✅ ALL CHECKS PASSED — safe to merge PR #5\n');
})().catch(err => {
  console.error('\n❌ TEST FAILED:');
  console.error(err.message);
  if (err.raw) console.error('Stripe error:', err.raw.code, err.raw.type);
  process.exit(1);
});
