// Golden questions for the site help widget's retrieval.
//
// scripts/validate-site-index.js runs each one against the real page index
// and corpus, as a signed-out visitor and as a member, in the build. A
// question passes when one of `expect` is within the first `within` results
// (default 1). `expect: []` means the site has nothing and must say so.
//
// These name hub pages, not issues, so a content drop does not move them.
// When a reader cannot find a page the widget should have found, add the
// question here with the page it should have returned.

module.exports = [
  // The question that started this (2026-11-13): a reader asked for the DHA
  // org chart and was sent to DHA's own website.
  { q: "Where can I find the DHA org chart?", expect: ["/premium/org-charts/dha"] },
  { q: "do you have a va org chart", expect: ["/premium/org-charts/va"] },
  { q: "HHS organizational chart", expect: ["/premium/org-charts/hhs"] },
  { q: "Who leads the DHA J-6?", expect: ["/premium/org-charts/dha", "/premium/key-people"], within: 2 },

  { q: "How much does Premium cost?", expect: ["/pricing"] },
  { q: "How do I cancel my subscription?", expect: ["/help"] },
  { q: "Can I get a refund?", expect: ["/help"] },
  { q: "I can't sign in to my dashboard", expect: ["/help", "/dashboard"] },
  { q: "How do I talk to a person?", expect: ["/help"] },
  { q: "Is my data private?", expect: ["/security", "/privacy"], within: 2 },

  { q: "What is ProposalPulse?", expect: ["/proposal-pulse"] },
  { q: "What is MarketPulse?", expect: ["/marketpulse"] },
  { q: "Can I see a sample MarketPulse brief?", expect: ["/samples/marketpulse-report", "/samples/sample-tactical-brief"] },
  { q: "Where is Ask MMT?", expect: ["/ask"] },
  { q: "Where is the pursuit calendar?", expect: ["/premium/calendar"] },
  { q: "How do I connect my AI assistant?", expect: ["/premium/ai-integrations", "/agent-access-guide"], within: 2 },
  { q: "What does the contract tracker cover?", expect: ["/contract-tracker"] },
  { q: "Where is the IDIQ tracker?", expect: ["/idiq-tracker"] },
  { q: "Is there a podcast?", expect: ["/podcast"] },
  { q: "Where is the glossary?", expect: ["/glossary"] },
  { q: "Where is the newswire?", expect: ["/newswire"] },

  { q: "what is the weather in Boston", expect: [] },
];
