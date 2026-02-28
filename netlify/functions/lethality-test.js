const Anthropic = require("@anthropic-ai/sdk");

const SYSTEM_PROMPT = `You are a federal health IT probability of win (pWin) analyzer. You evaluate proposal excerpts and pitch text against federal health IT acquisition criteria used by the Defense Health Agency (DHA), Veterans Affairs (VA), Military Health System (MHS), and related agencies.

Evaluate the submitted text across these 5 dimensions, scoring each 0-100:

1. **Mission Alignment** — Does the pitch clearly connect to DHA/VA/MHS missions? Does it reference specific programs (MHS GENESIS, EHRM, Cerner/Oracle Health, JOMIS, etc.)? Does it articulate how it saves lives, enhances readiness, or improves care transitions?

2. **Technical Approach** — Is the technical solution credible for federal health IT? Does it address interoperability (HL7 FHIR, TEFCA), security (FedRAMP, FISMA, HIPAA), or modernization priorities? Is the approach specific or generic?

3. **Past Performance** — Does the text signal relevant past performance? References to similar federal contracts, agency experience, cleared personnel, or domain-specific work? Strong past performance is the #1 discriminator in federal evaluation.

4. **Discriminators** — What makes this different from competitors? Unique technical capabilities, proprietary tools, key personnel, strategic partnerships, or innovation (AI/ML, zero trust, cloud-native)? Generic claims score low.

5. **Compliance Signals** — Does the text demonstrate awareness of federal acquisition norms? References to FAR/DFARS, Section 508, FedRAMP, ATO processes, small business requirements, CMMC, or specific contract vehicles (T4NG, CIO-SP4, VETS 2)?

Calculate an overall pWin score (0-100) as a weighted average:
- Mission Alignment: 25%
- Technical Approach: 20%
- Past Performance: 25%
- Discriminators: 15%
- Compliance Signals: 15%

Assign a confidence level:
- "High" if pWin >= 70
- "Medium" if pWin >= 40
- "Low" if pWin < 40

Provide exactly 3 specific, actionable recommendations for improving the pitch.

Respond ONLY with valid JSON in this exact format:
{
  "pwin": <number 0-100>,
  "confidence": "<High|Medium|Low>",
  "dimensions": [
    { "name": "Mission Alignment", "score": <number>, "assessment": "<1-2 sentences>" },
    { "name": "Technical Approach", "score": <number>, "assessment": "<1-2 sentences>" },
    { "name": "Past Performance", "score": <number>, "assessment": "<1-2 sentences>" },
    { "name": "Discriminators", "score": <number>, "assessment": "<1-2 sentences>" },
    { "name": "Compliance Signals", "score": <number>, "assessment": "<1-2 sentences>" }
  ],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "summary": "<2-3 sentence overall assessment>"
}`;

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://missionmeetstech.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const { text, uses } = body;

  if (!text || typeof text !== "string") {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Text is required" }),
    };
  }

  if (text.length < 50) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: "Text must be at least 50 characters. Provide enough detail for a meaningful analysis.",
      }),
    };
  }

  if (text.length > 10000) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: "Text must be under 10,000 characters.",
      }),
    };
  }

  if (typeof uses !== "number" || uses > 5) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Usage limit exceeded" }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Service configuration error" }),
    };
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze the following federal health IT proposal/pitch excerpt and provide a pWin assessment:\n\n${text}`,
        },
      ],
    });

    let responseText = message.content[0].text.trim();
    // Strip markdown code fences if present
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const result = JSON.parse(responseText);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Lethality test error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Analysis failed. Please try again.",
      }),
    };
  }
};
