// ============================================================
// vote-feature-meta.js — user-facing metadata for each vote feature, used
// by the "new feature is live" announcement (buildFeatureAnnounceHtml).
// Keyed by flag key. MMT voice: plain, concrete, no hype.
// ============================================================

const VOTE_FEATURE_META = {
  "vote_feature.vendor_watch": {
    name: "Vendor watch",
    description: "Track which agencies are buying or integrating a platform, and who's reselling it.",
    location: "Contract Tracker, the Platform filter row",
    how_to: "Open the tracker and pick a platform chip to see every tracked contract that names it.",
  },
  "vote_feature.teaming_signals": {
    name: "Partner and teaming signals",
    description: "See the prime and sub teaming on a tracked contract.",
    location: "Each contract's detail page",
    how_to: "Open a contract; the teaming section lists the primes and subs we have on file.",
  },
  "vote_feature.tracker_filters": {
    name: "Saved searches",
    description: "Save a tracker search and reload it in one click.",
    location: "Contract Tracker toolbar",
    how_to: "Filter the tracker the way you want, then click Save this search.",
  },
  "vote_feature.csv_export": {
    name: "CSV export",
    description: "Export the contracts you're looking at to a spreadsheet.",
    location: "Contract Tracker toolbar",
    how_to: "Click Export CSV to download the current filtered list.",
  },
  "vote_feature.tracker_api": {
    name: "Contract data API",
    description: "Read-only API access to the public tracker data.",
    location: "/api/contracts",
    how_to: "Request /api/contracts with your API key in the x-api-key header.",
  },
  "vote_feature.custom_watchlists": {
    name: "Custom watchlists and alerts",
    description: "Save a search and get a daily email when new contracts match.",
    location: "Contract Tracker, the Custom watchlists panel",
    how_to: "Add a keyword or agency, save it, and we'll email you new matches each day.",
  },
  "vote_feature.recompete_alerts": {
    name: "Recompete countdowns",
    description: "Know months ahead when a tracked contract comes up for recompete.",
    location: "Contract Tracker badges and your watchlist",
    how_to: "Watch for the recompete badge on a card, or set a lead time on a watchlist.",
  },
  "vote_feature.teaming_finder": {
    name: "Teaming-partner finder",
    description: "Find other tracked opportunities in the same contracting space.",
    location: "Contract Tracker, the Teaming-partner finder panel",
    how_to: "Pick an opportunity to see others that share its NAICS.",
  },
  "vote_feature.recompete_timeline": {
    name: "Recompete timeline",
    description: "See tracked contracts laid out on a lifecycle timeline.",
    location: "Contract Tracker, the Timeline view",
    how_to: "Switch to Timeline view to see the Upcoming, Active, and Awarded lanes.",
  },
  "vote_feature.proposalpulse_tiein": {
    name: "Score against this opportunity",
    description: "Send a tracked opportunity straight into ProposalPulse to score a draft.",
    location: "Each contract's detail page",
    how_to: "Open a contract and click Score a draft against this opportunity.",
  },
};

function featureMeta(key) {
  return (
    VOTE_FEATURE_META[key] || {
      name: key,
      description: "A new feature is live.",
      location: "Mission Meets Tech",
      how_to: "Explore it on the site.",
    }
  );
}

module.exports = { VOTE_FEATURE_META, featureMeta };
