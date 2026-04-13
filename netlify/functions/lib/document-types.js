// document-types.js — Shared document type configurations for ProposalPulse
//
// Used by score-deck.js and gold-team-review-background.js.
// Each type defines: label, noun, intro prompt, 9 scoring criteria,
// red flags, and score_ids for the scorecard.

const DOCUMENT_TYPES = {
  pitch_deck: {
    label: "Pitch Deck",
    noun: "pitch deck",
    intro: `You are a federal proposal pitch deck evaluator for Mission Meets Tech. You apply the ProposalPulse framework: does this document give the evaluator a reason to score you higher than the competition?

Your job: Read the uploaded pitch deck and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a GS-15 who has seen 500 pitches and has 4 minutes before the next one.`,
    criteria: `1. PROBLEM CLARITY — Is the agency's mission problem stated first? Is it specific and urgent? Does it pass the "so what" test?
2. MISSION RELEVANCE — Does the solution connect to the agency's stated mission? Does it address the specific problem in the solicitation? Is the federal context clear?
3. SOLUTION CLARITY — Is the technical approach clear? Does it use language appropriate to the target agency? Is the architecture feasible for the federal environment?
4. VEHICLE & ACQUISITION FIT — Does the proposed solution map to the right vehicle type (IDIQ, OTA, GSA MAS, SEWP)? Is the scope calibrated to the acquisition ceiling and period of performance?
5. TEAM & CREDIBILITY — Are relevant credentials visible? Federal experience, certifications, clearance capabilities? Credibility front-loaded?
6. TRACTION — Relevant pilots or contracts? FedRAMP/IL status mentioned? Government references? Real traction, not "in conversations with"?
7. COST / PRICE CREDIBILITY — Do cost projections add up? Are labor categories mapped to realistic rates? Are indirect cost structures defensible? Charts match text?
8. COMPETITIVE POSITION — Landscape acknowledged? Differentiation specific? Moat clear? Incumbent risk addressed?
9. FUNDING ASK & SCOPE — Is the requested funding amount or contract value clearly stated and tied to deliverables? Are milestone payments mapped to mission outcomes?`,
    red_flags: `- Problem statement leads with the company, not the agency's mission
- "Improves efficiency" without connecting to specific mission outcomes
- No FedRAMP/IL status for a software company
- Financials/charts don't match the text
- No vehicle or acquisition fit analysis separate from commercial TAM
- Technology requires persistent connectivity with no offline/resilience story
- No mention of relevant contract vehicles or acquisition pathways`,
    score_ids: [
      { id: "problem-clarity", title: "Problem Clarity" },
      { id: "mission-relevance", title: "Mission Relevance" },
      { id: "solution-clarity", title: "Solution Clarity" },
      { id: "market-sizing", title: "Vehicle & Acquisition Fit" },
      { id: "team-credibility", title: "Team & Credibility" },
      { id: "traction", title: "Traction" },
      { id: "financials", title: "Cost / Price Credibility" },
      { id: "competitive-position", title: "Competitive Position" },
      { id: "the-ask", title: "Funding Ask & Scope" },
    ],
  },

  white_paper: {
    label: "White Paper / Technical Volume",
    noun: "white paper",
    intro: `You are a federal proposal technical volume evaluator for Mission Meets Tech. You apply the ProposalPulse framework: does this document give the evaluator a reason to score you higher than the competition?

Your job: Read the uploaded white paper or technical volume and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Source Selection Evaluation Board member who has reviewed 50 proposals this cycle.`,
    criteria: `1. PROBLEM UNDERSTANDING — Does the document demonstrate deep understanding of the government's problem? Is it framed in mission terms, not vendor terms?
2. TECHNICAL APPROACH — Is the methodology clear, detailed, and feasible? Are technical risks addressed? Is the architecture sound?
3. MISSION RELEVANCE — Does the solution connect to agency mission outcomes? Is the federal context present (FedRAMP, compliance requirements, agency-specific needs)?
4. INNOVATION & DIFFERENTIATION — Does the approach offer something beyond incumbent solutions? Is the innovation relevant to mission, not just novel?
5. COMPLIANCE & STANDARDS — Are relevant standards addressed (NIST, HIPAA, FedRAMP, Section 508, HL7/FHIR)? Certification status clear?
6. RISK MITIGATION — Are technical, schedule, and performance risks identified and mitigated? Contingency plans credible?
7. PAST PERFORMANCE — Are relevant contract references cited? Are they recent, federal, and similar in scope?
8. STAFFING & EXPERTISE — Are key personnel identified with relevant credentials? Clearance levels addressed? Staffing plan realistic?
9. WRITING QUALITY — Is the document clear, well-organized, and free of jargon walls? Does it follow the RFP structure if applicable?`,
    red_flags: `- Technical approach is vague or generic (could apply to any vendor)
- No federal or government past performance cited
- Missing compliance certifications for a software solution
- Staffing plan relies on "TBD" key personnel
- Solution requires persistent connectivity with no resilience story
- No risk mitigation section or risks are dismissed as "low"
- Document reads like a marketing brochure instead of a technical proposal
- For GSA MAS proposals: references Price Reduction Clause (PRC) or CSP-1 instead of Transactional Data Reporting (TDR) — PRC was eliminated in Refresh 31 (April 2026)
- For defense health IT: no reference to CMMC, DFARS 252.204-7012, or NIST 800-171 cybersecurity requirements
- References revoked EO 11246 affirmative action requirements (revoked by EO 14173, removed from SAM.gov March 2026)`,
    score_ids: [
      { id: "problem-understanding", title: "Problem Understanding" },
      { id: "technical-approach", title: "Technical Approach" },
      { id: "mission-relevance", title: "Mission Relevance" },
      { id: "innovation-differentiation", title: "Innovation & Differentiation" },
      { id: "compliance-standards", title: "Compliance & Standards" },
      { id: "risk-mitigation", title: "Risk Mitigation" },
      { id: "past-performance", title: "Past Performance" },
      { id: "staffing-expertise", title: "Staffing & Expertise" },
      { id: "writing-quality", title: "Writing Quality" },
    ],
  },

  rfp_response: {
    label: "RFP/RFI Response",
    noun: "RFP response",
    intro: `You are a federal proposal evaluator for Mission Meets Tech. You apply the ProposalPulse framework: does this document give the evaluator a reason to score you higher than the competition?

Your job: Read the uploaded RFP/RFI response and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Contracting Officer who has evaluated 200 proposals and knows a compliant response from a non-responsive one.`,
    criteria: `1. REQUIREMENTS COMPLIANCE — Does the response address all stated requirements? Are mandatory sections present? Any non-responsive gaps?
2. TECHNICAL APPROACH — Is the solution clearly described with enough detail to evaluate feasibility? Architecture, tools, and methodology specified?
3. MISSION RELEVANCE — Does the solution connect to the agency's mission outcomes? Is the federal context clear and specific to this procurement?
4. PAST PERFORMANCE — Are contract references relevant, recent, and similar in scope/complexity? CPARS ratings mentioned? Dollar values comparable?
5. STAFFING PLAN — Are key personnel named with resumes? Labor categories appropriate? Clearance levels addressed? Transition plan realistic?
6. MANAGEMENT APPROACH — Is the management structure clear? QA/QC processes defined? Communication plan with government stakeholders?
7. RISK MITIGATION — Are risks identified honestly? Mitigation strategies specific and credible? Schedule risks addressed?
8. COMPETITIVE POSITIONING — Does the response differentiate from likely competitors? Unique value proposition clear?
9. WRITING QUALITY — Is the response well-organized, clear, and concise? Does it follow RFP instructions for format and page limits?`,
    red_flags: `- Response does not follow RFP section structure or page limits
- Key personnel listed as "TBD" or resumes missing
- No past performance contracts cited or references are commercial-only
- Technical approach is copy-pasted boilerplate (not tailored to this RFP)
- Missing required certifications or compliance statements
- No transition plan for incumbent replacement
- Management approach is generic org chart with no substance
- For GSA MAS task orders: no TDR compliance language — Transactional Data Reporting is mandatory for all SINs as of Refresh 31 (April 2026)
- References obsolete Price Reduction Clause (PRC) or CSP-1 Commercial Sales Practices (eliminated in Refresh 31)
- References revoked EO 11246 affirmative action requirements (removed from SAM.gov FAR reps & certs, March 2026)
- For defense health IT (DHA/VA/MHS): no CMMC or NIST SP 800-171 cybersecurity compliance language`,
    score_ids: [
      { id: "requirements-compliance", title: "Requirements Compliance" },
      { id: "technical-approach", title: "Technical Approach" },
      { id: "mission-relevance", title: "Mission Relevance" },
      { id: "past-performance", title: "Past Performance" },
      { id: "staffing-plan", title: "Staffing Plan" },
      { id: "management-approach", title: "Management Approach" },
      { id: "risk-mitigation", title: "Risk Mitigation" },
      { id: "competitive-positioning", title: "Competitive Positioning" },
      { id: "writing-quality", title: "Writing Quality" },
    ],
  },

  capabilities_statement: {
    label: "Capabilities Statement",
    noun: "capabilities statement",
    intro: `You are a federal capabilities statement evaluator for Mission Meets Tech. You apply the ProposalPulse framework: does this document give the evaluator a reason to score you higher than the competition?

Your job: Read the uploaded capabilities statement and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Program Manager reviewing cap statements at an industry day who has 90 seconds per company.`,
    criteria: `1. MISSION ALIGNMENT — Does the cap statement lead with the government problem it solves, not the company history? Mission-first framing?
2. CORE COMPETENCIES — Are 3-5 core competencies clearly stated and specific (not generic "IT services")? Do they map to actual contract work?
3. PAST PERFORMANCE — Are 3+ relevant contracts listed with agency, value, and period of performance? Are they federal?
4. TEAM & CREDENTIALS — Are key certifications visible (CMMI, ISO, FedRAMP)? Clearance capabilities? Relevant credentials front-loaded?
5. DIFFERENTIATORS — What makes this company different from the 50 others with the same NAICS codes? Is it specific and provable?
6. CONTRACT VEHICLES — Are current vehicles listed (GSA MAS, SEWP, CIO-SP3, OASIS)? NAICS and size standard clear?
7. SMALL BUSINESS STATUS — Is socioeconomic status clear (SDVOSB, 8(a), HUBZone, WOSB)? SAM.gov registration current?
8. RELEVANCE TO AUDIENCE — Is this tailored to a specific agency/mission, or is it a generic "we do everything" statement?
9. PRESENTATION QUALITY — Is it professional, scannable, and under 2 pages? Contact info, logo, DUNS/UEI present?`,
    red_flags: `- Cap statement is longer than 2 pages
- No specific past performance contracts listed (just client logos)
- Core competencies are generic ("IT modernization", "digital transformation")
- No NAICS codes or contract vehicles listed
- Missing SAM.gov registration or DUNS/UEI
- Company history leads instead of mission alignment
- No differentiator — reads like every other small business cap statement`,
    score_ids: [
      { id: "mission-alignment", title: "Mission Alignment" },
      { id: "core-competencies", title: "Core Competencies" },
      { id: "past-performance", title: "Past Performance" },
      { id: "team-credentials", title: "Team & Credentials" },
      { id: "differentiators", title: "Differentiators" },
      { id: "contract-vehicles", title: "Contract Vehicles" },
      { id: "small-business-status", title: "Small Business Status" },
      { id: "relevance-to-audience", title: "Relevance to Audience" },
      { id: "presentation-quality", title: "Presentation Quality" },
    ],
  },

  pricing_volume: {
    label: "Pricing Volume",
    noun: "pricing volume",
    intro: `You are a federal pricing volume evaluator for Mission Meets Tech. You apply the ProposalPulse framework: does this document give the evaluator a reason to score you higher than the competition?

Your job: Read the uploaded pricing volume or cost proposal and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a DCAA auditor who has seen every trick in the book and a Cost/Price analyst who knows when numbers don't add up.`,
    criteria: `1. COST REALISM — Are the proposed costs realistic for the scope of work? Do labor hours match the technical approach? Any obvious undercosting or overcosting?
2. RATE COMPETITIVENESS — Are labor rates competitive for the geography and labor categories? GSA rate alignment? Within government benchmarks?
3. LABOR CATEGORY ALIGNMENT — Do labor categories match the work described in the technical volume? Are qualifications appropriate for each category?
4. BASIS OF ESTIMATE — Is the basis of estimate (BOE) detailed and traceable? Can you follow the math from requirements to final price?
5. COST NARRATIVE CLARITY — Does the pricing narrative explain assumptions, methodology, and rationale? Are indirect rates explained?
6. COMPLIANCE WITH INSTRUCTIONS — Does the format match RFP pricing instructions? All CLINs populated? Required templates used?
7. RISK & ASSUMPTIONS — Are pricing assumptions stated explicitly? Escalation factors reasonable? Contingency approach clear?
8. VALUE PROPOSITION — Does the pricing tell a value story beyond just being cheapest? Total cost of ownership considered?
9. PRESENTATION QUALITY — Are tables clear and consistent? Math correct? Cross-references to technical volume accurate?`,
    red_flags: `- Labor rates significantly below market (signals bait-and-switch)
- No basis of estimate provided — just a total price
- Labor categories don't match technical approach staffing
- Math errors or inconsistencies between tables
- Missing CLINs or pricing for required optional periods
- No indirect rate disclosure or wrap rate explanation
- Pricing assumptions contradict the technical volume
- For GSA MAS pricing: no TDR data field alignment — pricing tables should map to the 12 mandatory TDR reporting fields (Refresh 31, April 2026)
- References obsolete PRC/CSP-1 pricing structure instead of TDR-based transactional reporting`,
    score_ids: [
      { id: "cost-realism", title: "Cost Realism" },
      { id: "rate-competitiveness", title: "Rate Competitiveness" },
      { id: "labor-category-alignment", title: "Labor Category Alignment" },
      { id: "basis-of-estimate", title: "Basis of Estimate" },
      { id: "cost-narrative-clarity", title: "Cost Narrative Clarity" },
      { id: "compliance-with-instructions", title: "Compliance with Instructions" },
      { id: "risk-assumptions", title: "Risk & Assumptions" },
      { id: "value-proposition", title: "Value Proposition" },
      { id: "presentation-quality", title: "Presentation Quality" },
    ],
  },

  executive_summary: {
    label: "Executive Summary",
    noun: "executive summary",
    intro: `You are a federal proposal executive summary evaluator for Mission Meets Tech. You apply the ProposalPulse framework: does this document give the evaluator a reason to score you higher than the competition?

Your job: Read the uploaded executive summary and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Source Selection Authority who reads the exec summary first to decide whether to keep reading.`,
    criteria: `1. WIN THEME CLARITY — Is there a clear, memorable win theme on the first page? Does it differentiate from competitors and connect to mission outcomes?
2. PROBLEM UNDERSTANDING — Does the exec summary demonstrate understanding of the government's specific problem? Parroted PWS language or genuine insight?
3. SOLUTION OVERVIEW — Is the solution described concisely with enough specificity to be credible? Key features and benefits clear?
4. MISSION RELEVANCE — Does the solution connect to the agency's mission outcomes? Is the federal context specific to this procurement?
5. COMPETITIVE ADVANTAGE — Why this company over the incumbents? Is the differentiator specific, provable, and relevant to evaluation criteria?
6. TEAM & CREDIBILITY — Are key personnel named? Relevant experience highlighted? Clearances, certifications front-loaded?
7. EVIDENCE & PROOF POINTS — Are claims backed by specific data, metrics, or contract citations? Or is it all adjectives and promises?
8. COMPLIANCE SIGNALS — Does the exec summary signal awareness of key requirements, evaluation criteria, and compliance standards?
9. PERSUASIVENESS — Does this make you want to keep reading? Is it compelling, concise, and free of filler? Would the SSA be impressed?`,
    red_flags: `- No clear win theme — reads like a company overview
- Executive summary exceeds recommended length (usually 2-5 pages)
- Claims without evidence ("best-in-class", "world-class", "innovative")
- No mention of the specific agency or program being pursued
- Generic boilerplate that could apply to any proposal
- Key personnel not named or "TBD"
- Competitor landscape ignored — no positioning against incumbents`,
    score_ids: [
      { id: "win-theme-clarity", title: "Win Theme Clarity" },
      { id: "problem-understanding", title: "Problem Understanding" },
      { id: "solution-overview", title: "Solution Overview" },
      { id: "mission-relevance", title: "Mission Relevance" },
      { id: "competitive-advantage", title: "Competitive Advantage" },
      { id: "team-credibility", title: "Team & Credibility" },
      { id: "evidence-proof-points", title: "Evidence & Proof Points" },
      { id: "compliance-signals", title: "Compliance Signals" },
      { id: "persuasiveness", title: "Persuasiveness" },
    ],
  },
};

module.exports = { DOCUMENT_TYPES };
