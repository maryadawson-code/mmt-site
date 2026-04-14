// founding-count.js — Returns remaining Founding Member spots
// Tries Stripe first (live count), falls back to FOUNDING_SPOTS_REMAINING env var

exports.handler = async () => {
  const TOTAL = 100;
  let remaining;

  try {
    const priceId = process.env.STRIPE_PRICE_FOUNDING;
    if (priceId && process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const subs = await stripe.subscriptions.list({
        price: priceId, status: 'active', limit: 100,
      });
      remaining = Math.max(0, TOTAL - subs.data.length);
    } else {
      remaining = parseInt(process.env.FOUNDING_SPOTS_REMAINING || '97', 10);
    }
  } catch (err) {
    console.warn('Stripe founding count failed, using env fallback:', err.message);
    remaining = parseInt(process.env.FOUNDING_SPOTS_REMAINING || '97', 10);
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://missionmeetstech.com',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify({ remaining }),
  };
};
