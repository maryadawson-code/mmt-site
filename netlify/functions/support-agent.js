// support-agent.js — AI-powered support agent for MMT
// Answers subscriber questions using platform knowledge base.
// Low-confidence answers auto-escalate to support@missionmeetstech.com via Resend.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://missionmeetstech.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Platform knowledge base — covers all tiers, features, pricing, and common issues
const KNOWLEDGE_BASE = `
# Mission Meets Tech — Support Knowledge Base

## Access Tiers
- **Free (no account):** Newsletter, podcast, article previews (first 2 paragraphs for articles under 90 days old), 50 glossary terms, contract tracker headlines (title, agency, status, summary), newswire headlines, 1 free ProposalPulse assessment, 1 free MarketPulse brief, Getting Started guide, Agency Sources page.
- **MMT Premium ($199/yr Founding, $249/yr Annual, $29/mo):** Everything free plus: full article archive, Capture Intelligence sheets, Premium Dashboard, Friday Brief (weekly), Monthly PDF Brief, Pursuit Calendar, Ask MMT (2 questions/month), Agency Intelligence Profiles (DHA, VA, HHS, ONC, ARPA-H, CMS), full Contract Tracker (vendor, value, NAICS, competitive intel), full IDIQ Tracker (awardees, burn rate, re-compete), Opportunity Radar, SB Vehicle Scanner, full Glossary (200+ terms), Newswire context notes, ProposalPulse discount ($14.99), MarketPulse discount ($35), 48-hour early access.
- **Institutional ($2,500-$5,000/yr):** Everything Premium plus: up to 5 team seats, Watchlist Alerts, exportable intelligence, included tool credits, priority Q&A (3/month), 1:1 onboarding session.

## Founding Member
- $199/year, locked permanently. First 100 subscribers get this rate for life. Once they're gone, the rate rises to $249/year.

## ProposalPulse
- Scores federal proposal drafts against 9 criteria (Problem Clarity, Agency Alignment, Technical Approach Clarity, Vehicle & Acquisition Fit, Team and Credibility, Traction, Cost/Price Credibility, Competitive Position, Funding Ask & Scope).
- Upload PDF, DOCX, or PPTX (max 25MB). Scorecard by email in 30-90 seconds.
- Includes Gold Team Review: AI-strengthened rewrite of all 9 sections + independent review.
- First assessment free. Additional: $19.99 ($14.99 for Premium).
- Documents NOT stored after processing. Not used to train AI models.

## MarketPulse
- Turns a federal health IT market question into a source-cited intelligence brief.
- Delivered within 24 hours by email.
- First brief free. Additional: $50 ($35 for Premium).

## Subscription Management
- Subscribe at missionmeetstech.com/pricing via Stripe.
- Sign in at missionmeetstech.com/dashboard with subscriber email.
- Switch plans: email support@missionmeetstech.com.
- Cancel monthly anytime before next billing date. Annual: cancel anytime, access continues through paid period.
- Refunds: Annual subscribers can request full refund within 14 days of any charge.

## Dashboard
- Access at missionmeetstech.com/premium/dashboard/
- Sidebar navigation to all premium features.
- Settings at missionmeetstech.com/premium/settings/ for agency focus, role, NAICS codes, notification preferences.

## Ask MMT
- Premium: 2 questions/month. Answered editorially within 5 business days.
- Institutional: 3 questions/month with priority.
- Submit via the Ask MMT portal in the dashboard.

## Contact
- Product support: support@missionmeetstech.com
- Editorial/founder: mary@missionmeetstech.com
- LinkedIn: linkedin.com/in/marydwomack-digitalhealth/

## Common Issues
- "I can't see premium content": Make sure you're signed in with the same email used for your Stripe subscription. Try signing out and back in.
- "My scorecard didn't arrive": Check spam folder. Scorecards come from noreply@missionmeetstech.com. If still missing after 5 minutes, email support@missionmeetstech.com.
- "How do I access the dashboard": Go to missionmeetstech.com/premium/dashboard/ and enter your subscriber email.
- "Can I share my account": Individual plans are single-user. Institutional plans include up to 5 seats.
- "How do I export data": Export features are available on Institutional plans only.
`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { question, email, sessionId } = body;
  if (!question || typeof question !== 'string' || question.trim().length < 3) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Question is required (min 3 characters)' }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Support agent not configured' }),
    };
  }

  try {
    // Call Claude to answer the question
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: `You are the Mission Meets Tech support assistant. Answer subscriber questions using ONLY the knowledge base below. Be concise, friendly, and specific.

Rules:
- Answer in 2-4 sentences max unless the question requires detail.
- If you can answer confidently from the knowledge base, set confidence to "high".
- If the question is partially covered, answer what you can and set confidence to "medium".
- If the question is NOT covered in the knowledge base (billing disputes, technical bugs, account-specific issues, custom requests), set confidence to "low" and say you're connecting them with the team.
- Never make up information not in the knowledge base.
- Never share internal technical details about the platform.
- Use a warm, direct tone. No corporate jargon.

${KNOWLEDGE_BASE}

Respond in JSON format: { "answer": "your answer", "confidence": "high|medium|low", "category": "billing|features|tools|account|general" }`,
        messages: [{ role: 'user', content: question.trim().substring(0, 1000) }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API ${response.status}`);
    }

    const data = await response.json();
    const text = data.content[0].text;

    let parsed;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      parsed = { answer: text, confidence: 'medium', category: 'general' };
    }

    // Auto-escalate low-confidence answers to human support
    if (parsed.confidence === 'low' && email) {
      try {
        const { sendEmail } = require('./lib/send-email');
        await sendEmail({
          to: 'support@missionmeetstech.com',
          subject: `[Support Escalation] ${question.trim().substring(0, 80)}`,
          from: 'MMT Support Agent <noreply@missionmeetstech.com>',
          html: `
            <div style="font-family:Inter,sans-serif;max-width:600px;">
              <h2 style="color:#0A192F;font-size:18px;">Support Escalation</h2>
              <p style="color:#5C6B7A;font-size:14px;">The AI support agent couldn't confidently answer this question.</p>
              <div style="background:#F3F4F6;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="font-size:13px;color:#5C6B7A;margin:0 0 4px;">From: <strong>${email}</strong></p>
                <p style="font-size:15px;color:#0A192F;margin:0;"><strong>Question:</strong> ${question.trim()}</p>
              </div>
              <div style="background:#FEF9E7;border:1px solid rgba(146,113,10,0.15);border-radius:8px;padding:16px;margin:16px 0;">
                <p style="font-size:13px;color:#92710A;margin:0 0 4px;">AI attempted answer:</p>
                <p style="font-size:14px;color:#5C6B7A;margin:0;">${parsed.answer}</p>
              </div>
              <p style="font-size:13px;color:#5C6B7A;">Category: ${parsed.category} | Session: ${sessionId || 'none'}</p>
              <p style="font-size:13px;color:#5C6B7A;">Reply directly to <a href="mailto:${email}">${email}</a> to respond.</p>
            </div>
          `,
        });
        parsed.answer += ' I\'ve flagged your question for Mary\'s team. They\'ll follow up at ' + email + ' within 1 business day.';
      } catch (escalateErr) {
        console.error('Escalation email failed:', escalateErr.message);
        parsed.answer += ' For this question, please email support@missionmeetstech.com directly.';
      }
    } else if (parsed.confidence === 'low') {
      parsed.answer += ' For this question, please email support@missionmeetstech.com directly.';
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: parsed.answer,
        confidence: parsed.confidence,
        category: parsed.category,
        escalated: parsed.confidence === 'low',
      }),
    };
  } catch (err) {
    console.error('Support agent error:', err.message);
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: 'I\'m having trouble right now. Please email support@missionmeetstech.com and someone will help you within 1 business day.',
        confidence: 'error',
        category: 'general',
        escalated: false,
      }),
    };
  }
};
