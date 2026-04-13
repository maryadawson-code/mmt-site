// founding-count.js — Returns remaining Founding Member spots
// Reads from FOUNDING_SPOTS_REMAINING env var (set in Netlify dashboard)

exports.handler = async () => {
  const count = parseInt(process.env.FOUNDING_SPOTS_REMAINING || '97', 10);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://missionmeetstech.com',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({ remaining: count }),
  };
};
