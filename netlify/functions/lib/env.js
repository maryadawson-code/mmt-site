// env.js — Environment detection for staging vs production

function getEnv() {
  const context = process.env.CONTEXT || "production";
  const isStaging = context !== "production";
  const isProd = context === "production";
  return {
    context,
    isStaging,
    isProd,
    siteUrl: isProd
      ? "https://missionmeetstech.com"
      : process.env.DEPLOY_PRIME_URL || "http://localhost:8888",
    orderTag: isStaging ? "staging" : "production",
    emailOverride: isStaging ? "maryadawson@gmail.com" : null,
    skipStripe: isStaging,
  };
}

module.exports = { getEnv };
