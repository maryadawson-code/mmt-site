// ============================================================
// score-deck.js — Netlify Function (MissionPulse Backend v1)
//
// Shared backend for missionmeetstech.com + future MissionPulse SaaS.
// Uses mp_users, mp_feature_usage, mp_scoring_history tables.
//
// Supports 6 document types: pitch_deck, white_paper, rfp_response,
// capabilities_statement, pricing_volume, executive_summary.
//
// PDF  → sent as native document to Claude (visual layout preserved)
// PPTX → text extracted via officeparser → sent as text
// DOCX → text extracted via mammoth → sent as text
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const mammoth = require("mammoth");
const officeparser = require("officeparser");

// --- Environment Variables ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Constants ---
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 2000;
const MAX_TEXT_CHARS = 80000;
const MODEL = "claude-sonnet-4-5-20250929";
const FEATURE_NAME = "lethality_test";
const FREE_USES = 3;

const ALLOWED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "pptx",
  "application/msword": "docx",
};

// --- CORS Headers ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


// ============================================================
// DOCUMENT TYPE CONFIGURATIONS
// ============================================================

const DOCUMENT_TYPES = {
  pitch_deck: {
    label: "Pitch Deck",
    noun: "pitch deck",
    intro: `You are a defense contracting pitch deck evaluator for Mission Meets Tech. You apply "The Lethality Test" framework based on Secretary of War Pete Hegseth's standard: "If a contract doesn't make us more lethal, it's gone."

Your job: Read the uploaded pitch deck and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a GS-15 who has seen 500 pitches and has 4 minutes before the next one.`,
    criteria: `1. PROBLEM CLARITY — Is the warfighter/mission problem stated first? Is it specific and urgent? Does it pass the "so what" test?
2. NATSEC RELEVANCE — Does the solution map to Kill Chain functions (Find, Fix, Track, Target, Engage, Assess, Sustain)? Is defense context present (BATDOK, DDIL, Role 2E, theater evac)?
3. SOLUTION CLARITY — Is the technical approach clear? Does it use NatSec language (not civilian healthcare speak)? Offline/DDIL capability?
4. MARKET SIZING — Is DoD/DHA/VA market sized separately from commercial TAM? Government vehicles mentioned (OTAs, IDIQs, SBIR)?
5. TEAM & CREDIBILITY — Veteran status visible? Defense health credentials? Service branch? Credibility front-loaded?
6. TRACTION — Pilots defense-adjacent? FedRAMP/IL status mentioned? Government references? Real traction, not "in conversations with"?
7. FINANCIALS — Numbers add up? Charts match text? Projections defensible? Unit economics clear?
8. COMPETITIVE POSITION — Landscape acknowledged? Differentiation specific? Moat clear? Incumbent risk addressed?
9. THE ASK — Funding amount clear? Milestones tied to defense outcomes? Use of funds logical?`,
    red_flags: `- Civilian healthcare problem leads before warfighter problem
- No veteran credentials visible at veteran pitch competition
- "Improves efficiency" without connecting to readiness/lethality
- No FedRAMP/IL status for a software company
- Financials/charts don't match the text
- No DoD/DHA market sizing separate from commercial TAM
- Technology requires persistent connectivity with no offline story`,
    score_ids: [
      { id: "problem-clarity", title: "Problem Clarity" },
      { id: "natsec-relevance", title: "NatSec Relevance" },
      { id: "solution-clarity", title: "Solution Clarity" },
      { id: "market-sizing", title: "Market Sizing" },
      { id: "team-credibility", title: "Team & Credibility" },
      { id: "traction", title: "Traction" },
      { id: "financials", title: "Financials" },
      { id: "competitive-position", title: "Competitive Position" },
      { id: "the-ask", title: "The Ask" },
    ],
  },

  white_paper: {
    label: "White Paper / Technical Volume",
    noun: "white paper",
    intro: `You are a defense contracting technical volume evaluator for Mission Meets Tech. You apply "The Lethality Test" framework based on Secretary of War Pete Hegseth's standard: "If a contract doesn't make us more lethal, it's gone."

Your job: Read the uploaded white paper or technical volume and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Source Selection Evaluation Board member who has reviewed 50 proposals this cycle.`,
    criteria: `1. PROBLEM UNDERSTANDING — Does the document demonstrate deep understanding of the government's problem? Is it framed in mission terms, not vendor terms?
2. TECHNICAL APPROACH — Is the methodology clear, detailed, and feasible? Are technical risks addressed? Is the architecture sound?
3. NATSEC RELEVANCE — Does the solution connect to warfighter outcomes, readiness, or lethality? Defense context (DDIL, FedRAMP, IL levels)?
4. INNOVATION & DIFFERENTIATION — Does the approach offer something beyond incumbent solutions? Is the innovation relevant to mission, not just novel?
5. COMPLIANCE & STANDARDS — Are relevant standards addressed (NIST, HIPAA, FedRAMP, Section 508, HL7/FHIR)? Certification status clear?
6. RISK MITIGATION — Are technical, schedule, and performance risks identified and mitigated? Contingency plans credible?
7. PAST PERFORMANCE — Are relevant contract references cited? Are they recent, defense-adjacent, and similar in scope?
8. STAFFING & EXPERTISE — Are key personnel identified with relevant credentials? Clearance levels addressed? Staffing plan realistic?
9. WRITING QUALITY — Is the document clear, well-organized, and free of jargon walls? Does it follow the RFP structure if applicable?`,
    red_flags: `- Technical approach is vague or generic (could apply to any vendor)
- No defense or government past performance cited
- Missing compliance certifications for a software solution
- Staffing plan relies on "TBD" key personnel
- Solution requires persistent connectivity with no DDIL story
- No risk mitigation section or risks are dismissed as "low"
- Document reads like a marketing brochure instead of a technical proposal`,
    score_ids: [
      { id: "problem-understanding", title: "Problem Understanding" },
      { id: "technical-approach", title: "Technical Approach" },
      { id: "natsec-relevance", title: "NatSec Relevance" },
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
    intro: `You are a defense contracting proposal evaluator for Mission Meets Tech. You apply "The Lethality Test" framework based on Secretary of War Pete Hegseth's standard: "If a contract doesn't make us more lethal, it's gone."

Your job: Read the uploaded RFP/RFI response and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Contracting Officer who has evaluated 200 proposals and knows a compliant response from a non-responsive one.`,
    criteria: `1. REQUIREMENTS COMPLIANCE — Does the response address all stated requirements? Are mandatory sections present? Any non-responsive gaps?
2. TECHNICAL APPROACH — Is the solution clearly described with enough detail to evaluate feasibility? Architecture, tools, and methodology specified?
3. NATSEC RELEVANCE — Does the solution connect to warfighter outcomes? Defense-specific context (DDIL, theater ops, readiness metrics)?
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
- Management approach is generic org chart with no substance`,
    score_ids: [
      { id: "requirements-compliance", title: "Requirements Compliance" },
      { id: "technical-approach", title: "Technical Approach" },
      { id: "natsec-relevance", title: "NatSec Relevance" },
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
    intro: `You are a defense contracting capabilities statement evaluator for Mission Meets Tech. You apply "The Lethality Test" framework based on Secretary of War Pete Hegseth's standard: "If a contract doesn't make us more lethal, it's gone."

Your job: Read the uploaded capabilities statement and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Program Manager reviewing cap statements at an industry day who has 90 seconds per company.`,
    criteria: `1. MISSION ALIGNMENT — Does the cap statement lead with the government problem it solves, not the company history? Mission-first framing?
2. CORE COMPETENCIES — Are 3-5 core competencies clearly stated and specific (not generic "IT services")? Do they map to actual contract work?
3. PAST PERFORMANCE — Are 3+ relevant contracts listed with agency, value, and period of performance? Are they defense/federal health?
4. TEAM & CREDENTIALS — Are key certifications visible (CMMI, ISO, FedRAMP)? Veteran-owned status? Clearance capabilities?
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
    intro: `You are a defense contracting pricing volume evaluator for Mission Meets Tech. You apply "The Lethality Test" framework based on Secretary of War Pete Hegseth's standard: "If a contract doesn't make us more lethal, it's gone."

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
- Pricing assumptions contradict the technical volume`,
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
    intro: `You are a defense contracting executive summary evaluator for Mission Meets Tech. You apply "The Lethality Test" framework based on Secretary of War Pete Hegseth's standard: "If a contract doesn't make us more lethal, it's gone."

Your job: Read the uploaded executive summary and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a Source Selection Authority who reads the exec summary first to decide whether to keep reading.`,
    criteria: `1. WIN THEME CLARITY — Is there a clear, memorable win theme on the first page? Does it differentiate from competitors and connect to mission outcomes?
2. PROBLEM UNDERSTANDING — Does the exec summary demonstrate understanding of the government's specific problem? Parroted PWS language or genuine insight?
3. SOLUTION OVERVIEW — Is the solution described concisely with enough specificity to be credible? Key features and benefits clear?
4. NATSEC RELEVANCE — Does the solution connect to warfighter outcomes, readiness, or lethality? Defense-specific language and context?
5. COMPETITIVE ADVANTAGE — Why this company over the incumbents? Is the differentiator specific, provable, and relevant to evaluation criteria?
6. TEAM & CREDIBILITY — Are key personnel named? Relevant experience highlighted? Veteran status, clearances, certifications front-loaded?
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
      { id: "natsec-relevance", title: "NatSec Relevance" },
      { id: "competitive-advantage", title: "Competitive Advantage" },
      { id: "team-credibility", title: "Team & Credibility" },
      { id: "evidence-proof-points", title: "Evidence & Proof Points" },
      { id: "compliance-signals", title: "Compliance Signals" },
      { id: "persuasiveness", title: "Persuasiveness" },
    ],
  },
};


// ============================================================
// PROMPT BUILDER
// ============================================================

const GRADING_SCALE = `GRADING SCALE:
A = Exceeds expectations (4.0 pts)
B+ = Strong (3.5 pts)
B = Meets the bar (3.0 pts)
B- = Acceptable, some gaps (2.5 pts)
C+ = Below bar, needs work (2.0 pts)
C = Weak, significant revision (1.5 pts)
D = Missing or fundamentally flawed (1.0 pts)
F = Absent or counterproductive (0.0 pts)`;

const SCORING_RULES = `RULES:
- Score what is in the document. Do not infer what might be said verbally or in other volumes.
- If a criterion cannot be evaluated (e.g., missing section), grade it D with a note.
- Be direct. "This section is weak because..." not "This could perhaps be strengthened by..."
- The assessment field should be specific to this document, not generic advice.
- Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;

function buildResponseFormat(scoreIds) {
  const exampleGrades = ["B+", "C+", "B", "C", "B-", "B", "D", "D", "B-"];
  const examplePoints = [3.5, 2.0, 3.0, 1.5, 2.5, 3.0, 1.0, 1.0, 2.5];
  const examples = scoreIds.map((s, i) => `    {
      "id": "${s.id}",
      "title": "${s.title}",
      "grade": "${exampleGrades[i % exampleGrades.length]}",
      "points": ${examplePoints[i % examplePoints.length]},
      "assessment": "Two sentences max. What's working and what's not."
    }`);

  return `RESPONSE FORMAT — You MUST respond with valid JSON only. No markdown, no preamble, no explanation outside the JSON structure:

{
  "scores": [
${examples.join(",\n")}
  ],
  "red_flags": [
    "Specific red flag found in this document",
    "Another red flag if applicable"
  ],
  "verdict": "PASS | CONDITIONAL | FAIL",
  "verdict_title": "One sentence verdict headline",
  "verdict_summary": "2-3 sentence summary of the overall assessment. Be specific to this document.",
  "top_fix": "The single most impactful change the author should make before the next submission."
}`;
}

function buildSystemPrompt(documentType) {
  const config = DOCUMENT_TYPES[documentType];

  return `${config.intro}

NOTE: The document may be provided as a PDF (with visual layout) or as extracted text from a PowerPoint or Word document. If provided as text, evaluate based on content quality regardless of visual formatting. If layout details are missing, note that in relevant criteria but focus on substance.

SCORING CRITERIA (Grade A through F):

${config.criteria}

${GRADING_SCALE}

RED FLAGS (auto-fail triggers):
${config.red_flags}

${buildResponseFormat(config.score_ids)}

${SCORING_RULES}`;
}


// ============================================================
// FILE PROCESSING
// ============================================================

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractPptxText(buffer) {
  return await officeparser.parseOfficeAsync(buffer);
}

function buildMessageContent(fileType, base64Data, extractedText, documentType) {
  const config = DOCUMENT_TYPES[documentType];
  const noun = config.noun;
  const userPrompt = `Score this ${noun} using The Lethality Test. Return only the JSON scorecard.`;

  if (fileType === "pdf") {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Data },
      },
      { type: "text", text: userPrompt },
    ];
  }

  const formatLabel = fileType === "pptx" ? "PowerPoint" : "Word document";
  const textContent = extractedText.length > MAX_TEXT_CHARS
    ? extractedText.substring(0, MAX_TEXT_CHARS) + `\n\n[TEXT TRUNCATED — ${noun} exceeds maximum length]`
    : extractedText;

  return [
    {
      type: "text",
      text: `The following is the full text content extracted from a ${formatLabel} ${noun}. Evaluate it as you would a visual document, but note that formatting and visual layout are not available for this file type.\n\n---\n\n${textContent}\n\n---\n\n${userPrompt}`,
    },
  ];
}


// ============================================================
// MISSIONPULSE USER & USAGE MANAGEMENT
// ============================================================

/**
 * Get or create a MissionPulse user. Returns the user record.
 */
async function getOrCreateUser(supabase, email) {
  const normalizedEmail = email.toLowerCase().trim();

  // Try to find existing user
  let { data: user, error: fetchErr } = await supabase
    .from("mp_users")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (fetchErr && fetchErr.code === "PGRST116") {
    // No user found — create one
    const { data: newUser, error: insertErr } = await supabase
      .from("mp_users")
      .insert({
        email: normalizedEmail,
        source: "lethality_test",
        tier: "free",
      })
      .select()
      .single();

    if (insertErr) throw new Error(`User creation failed: ${insertErr.message}`);
    user = newUser;

    // Create initial feature usage record
    const { error: usageErr } = await supabase
      .from("mp_feature_usage")
      .insert({
        user_id: user.id,
        feature: FEATURE_NAME,
        uses_remaining: FREE_USES,
        uses_total: 0,
      });

    if (usageErr) throw new Error(`Usage record creation failed: ${usageErr.message}`);
  } else if (fetchErr) {
    throw new Error(`User lookup failed: ${fetchErr.message}`);
  }

  return user;
}

/**
 * Get feature usage for a user. Creates record if missing (handles users created before this feature).
 */
async function getFeatureUsage(supabase, userId) {
  let { data: usage, error: fetchErr } = await supabase
    .from("mp_feature_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("feature", FEATURE_NAME)
    .single();

  if (fetchErr && fetchErr.code === "PGRST116") {
    // User exists but no usage record for this feature — create one
    const { data: newUsage, error: insertErr } = await supabase
      .from("mp_feature_usage")
      .insert({
        user_id: userId,
        feature: FEATURE_NAME,
        uses_remaining: FREE_USES,
        uses_total: 0,
      })
      .select()
      .single();

    if (insertErr) throw new Error(`Usage creation failed: ${insertErr.message}`);
    usage = newUsage;
  } else if (fetchErr) {
    throw new Error(`Usage lookup failed: ${fetchErr.message}`);
  }

  return usage;
}

/**
 * Decrement usage and update activity timestamps.
 */
async function recordUsage(supabase, userId, usage) {
  const now = new Date().toISOString();

  // Decrement feature usage
  await supabase
    .from("mp_feature_usage")
    .update({
      uses_remaining: usage.uses_remaining - 1,
      uses_total: (usage.uses_total || 0) + 1,
      last_used_at: now,
    })
    .eq("user_id", userId)
    .eq("feature", FEATURE_NAME);

  // Update user last_active_at
  await supabase
    .from("mp_users")
    .update({ last_active_at: now })
    .eq("id", userId);
}

/**
 * Compute overall grade from scorecard scores.
 */
function computeOverallGrade(scorecard) {
  const avgScore = scorecard.scores
    ? scorecard.scores.reduce((sum, s) => sum + (s.points || 0), 0) / scorecard.scores.length
    : null;

  let grade;
  if (avgScore >= 3.75) grade = "A";
  else if (avgScore >= 3.25) grade = "B+";
  else if (avgScore >= 2.75) grade = "B";
  else if (avgScore >= 2.25) grade = "B-";
  else if (avgScore >= 1.75) grade = "C+";
  else if (avgScore >= 1.25) grade = "C";
  else if (avgScore >= 0.75) grade = "D";
  else grade = "F";

  return { avgScore, overallGrade: grade };
}

/**
 * Save scoring results to history.
 */
async function saveScoreHistory(supabase, userId, fileName, fileType, scorecard, tokenUsage, documentType) {
  const { avgScore, overallGrade } = computeOverallGrade(scorecard);

  await supabase.from("mp_scoring_history").insert({
    user_id: userId,
    feature: FEATURE_NAME,
    file_name: fileName || null,
    file_type: fileType,
    document_type: documentType,
    verdict: scorecard.verdict || null,
    overall_grade: overallGrade,
    avg_score: avgScore ? parseFloat(avgScore.toFixed(2)) : null,
    scores: scorecard.scores || null,
    red_flags: scorecard.red_flags || null,
    top_fix: scorecard.top_fix || null,
    model_used: MODEL,
    tokens_input: tokenUsage.input || null,
    tokens_output: tokenUsage.output || null,
  });
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { email, file_base64, file_type, file_name } = body;
    const documentType = body.document_type || "pitch_deck";

    // --- Validate inputs ---
    if (!email || !file_base64 || !file_type) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing email, file data, or file type" }),
      };
    }

    if (!DOCUMENT_TYPES[documentType]) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Unknown document type "${documentType}". Valid types: ${Object.keys(DOCUMENT_TYPES).join(", ")}`,
        }),
      };
    }

    const resolvedType = ALLOWED_TYPES[file_type];
    if (!resolvedType) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "Unsupported file type. Upload a PDF, PowerPoint (.pptx), or Word (.docx) file.",
        }),
      };
    }

    const estimatedSize = (file_base64.length * 3) / 4;
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      return {
        statusCode: 413,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "File too large. Maximum 15MB." }),
      };
    }

    // --- MissionPulse: User & Usage ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let user;
    try {
      user = await getOrCreateUser(supabase, email);
    } catch (err) {
      console.error("User management error:", err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Account error. Please try again." }),
      };
    }

    let usage;
    try {
      usage = await getFeatureUsage(supabase, user.id);
    } catch (err) {
      console.error("Usage lookup error:", err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Usage check failed. Please try again." }),
      };
    }

    // Check remaining uses (free tier gate; pro/enterprise bypass in future)
    if (user.tier === "free" && usage.uses_remaining <= 0) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "limit_reached",
          message: "You've used all 3 free assessments. Contact Mission Meets Tech for a full review.",
          uses_remaining: 0,
        }),
      };
    }

    // --- Process file ---
    let extractedText = null;
    const fileBuffer = Buffer.from(file_base64, "base64");

    if (resolvedType === "docx") {
      try {
        extractedText = await extractDocxText(fileBuffer);
        if (!extractedText || extractedText.trim().length < 50) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: "Could not extract enough text from this Word document. The file may be image-heavy or corrupted. Try exporting as PDF.",
            }),
          };
        }
      } catch (parseErr) {
        console.error("DOCX parse error:", parseErr);
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: "Failed to read this Word document. Make sure it's a valid .docx file (not .doc). Try exporting as PDF.",
          }),
        };
      }
    }

    if (resolvedType === "pptx") {
      try {
        extractedText = await extractPptxText(fileBuffer);
        if (!extractedText || extractedText.trim().length < 50) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: "Could not extract enough text from this PowerPoint. The file may be image-heavy. Try exporting as PDF for best results.",
            }),
          };
        }
      } catch (parseErr) {
        console.error("PPTX parse error:", parseErr);
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: "Failed to read this PowerPoint file. Make sure it's a valid .pptx file (not .ppt). Try exporting as PDF.",
          }),
        };
      }
    }

    // --- Build prompt and call Claude API ---
    const systemPrompt = buildSystemPrompt(documentType);
    const messageContent = buildMessageContent(resolvedType, file_base64, extractedText, documentType);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: messageContent }],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", claudeResponse.status, errText);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "AI scoring service error. Please try again." }),
      };
    }

    const claudeData = await claudeResponse.json();

    // Extract token usage for cost tracking
    const tokenUsage = {
      input: claudeData.usage?.input_tokens || null,
      output: claudeData.usage?.output_tokens || null,
    };

    const responseText = claudeData.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON
    let scorecard;
    try {
      const cleaned = responseText.replace(/```json\s?/g, "").replace(/```/g, "").trim();
      scorecard = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Raw:", responseText.substring(0, 500));
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "AI returned invalid scoring format. Please try again." }),
      };
    }

    // --- MissionPulse: Record usage + save history ---
    const { overallGrade } = computeOverallGrade(scorecard);

    try {
      await recordUsage(supabase, user.id, usage);
      await saveScoreHistory(supabase, user.id, file_name, resolvedType, scorecard, tokenUsage, documentType);
    } catch (err) {
      console.error("Post-scoring DB error:", err);
      // Don't fail the response — user already has their results
    }

    // --- Send score receipt email (non-blocking) ---
    try {
      const { sendEmail } = require("./lib/send-email");
      const { buildScoreReceiptHtml } = require("./lib/email-templates");
      const config = DOCUMENT_TYPES[documentType];
      await sendEmail({
        to: email,
        subject: `Your Lethality Test Results: ${scorecard.verdict} — ${config.label}`,
        html: buildScoreReceiptHtml({
          scorecard,
          documentType,
          documentLabel: config.label,
          overallGrade,
          usesRemaining: usage.uses_remaining - 1,
          fileName: file_name,
        }),
      });
    } catch (emailErr) {
      console.error("Receipt email error:", emailErr);
      // Don't fail the response — scoring succeeded
    }

    // --- Return results ---
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        scorecard,
        document_type: documentType,
        uses_remaining: user.tier === "free" ? usage.uses_remaining - 1 : 999,
        file_type_processed: resolvedType,
        model: MODEL,
        user_tier: user.tier,
      }),
    };
  } catch (err) {
    console.error("Unhandled error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
