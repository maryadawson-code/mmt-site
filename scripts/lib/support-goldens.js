// Golden questions for the site help widget's retrieval.
//
// scripts/validate-site-index.js runs each one against the real page index
// and corpus, as a signed-out visitor and as a member, in the build.
//   expect   one of these pages is within the first `within` results
//            (default 1). `expect: []` means the site has nothing and must
//            say so.
//   not      none of these pages is the first result
//   passage  some signed-out source's passage matches (the page was found
//            AND the stretch shown to the model holds the answer)
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
  // A topic acronym (CIO) used to outrank the agency's own chart.
  { q: "Who is the DHA CIO?", expect: ["/premium/org-charts/dha"] },
  { q: "Who is the VA CIO?", expect: ["/premium/org-charts/va"] },

  { q: "How much does Premium cost?", expect: ["/pricing"], passage: /\$249/ },
  { q: "What does Premium include?", expect: ["/pricing"] },
  { q: "How much does ProposalPulse cost?", expect: ["/pricing", "/proposal-pulse"], passage: /\$19\.99/ },
  { q: "How do I cancel my subscription?", expect: ["/help"] },
  { q: "Can I get a refund?", expect: ["/help"], passage: /refund within 14 days/i },
  { q: "I can't sign in to my dashboard", expect: ["/help", "/dashboard"] },
  { q: "How do I talk to a person?", expect: ["/help"] },
  { q: "Is my data private?", expect: ["/security", "/privacy"], within: 2 },

  // A question about an agency is not a question about MMT's prices or
  // MMT's support desk.
  { q: "How much does DHA spend on IT?", not: ["/pricing"] },
  { q: "How do I contact DHA contracting?", not: ["/help"] },
  // A two-letter agency on its own used to find nothing at all.
  { q: "Tell me about the VA", expect: ["/agencies/va"] },
  { q: "CMS agency profile", expect: ["/agencies/cms"], within: 2 },

  { q: "What is ProposalPulse?", expect: ["/proposal-pulse"] },
  { q: "What is MarketPulse?", expect: ["/marketpulse"] },
  { q: "Can I see a sample MarketPulse brief?", expect: ["/samples/marketpulse-report", "/samples/sample-tactical-brief"] },
  { q: "Where is Ask MMT?", expect: ["/ask"] },
  { q: "Where is the pursuit calendar?", expect: ["/premium/calendar"] },
  { q: "How do I connect my AI assistant?", expect: ["/premium/ai-integrations", "/agent-access-guide"], within: 2 },
  { q: "What does the contract tracker cover?", expect: ["/contract-tracker"] },
  { q: "Where is the IDIQ tracker?", expect: ["/idiq-tracker"] },
  // No word in common with the page that answers it; the scorer alone
  // answered with an article about a "digital signal" (2026-11-19).
  { q: "How do I sign up?", expect: ["/newsletter", "/pricing"] },
  // The page is named by its section and its subject together. A brief
  // titled for the calendar is as good a first link, so the top two count.
  { q: "Is the calendar Premium?", expect: ["/premium/calendar"], within: 2 },
  { q: "Where is the signal chain?", expect: ["/premium/signal-chain"] },
  { q: "Is there a podcast?", expect: ["/podcast"] },
  { q: "Where is the glossary?", expect: ["/glossary"] },
  { q: "Where is the newswire?", expect: ["/newswire"] },
  // A signed-out reader gets the term's own page; a member gets the glossary entry.
  { q: "what is TEFCA", expect: ["/glossary/tefca", "/glossary"] },

  { q: "what is the weather in Boston", expect: [] },
];
