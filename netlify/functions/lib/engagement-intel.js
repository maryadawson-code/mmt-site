// ============================================================
// engagement-intel.js — LinkedIn engagement intelligence
//
// Uses Claude + web_search to find high-value engagement
// opportunities for MMT on LinkedIn.
// ============================================================

const { callClaudeSearch } = require("./claude-search");

/**
 * Generate engagement intelligence brief.
 *
 * @param {Object} supabase - Supabase client for cost tracking
 * @param {Object} opts
 * @param {string[]} opts.topics - Topics to search
 * @returns {Promise<{high_priority: Array, trending_topics: Array, generated_at: string, error?: string}>}
 */
async function generateEngagementBrief(supabase, { topics }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { high_priority: [], trending_topics: [], error: "ANTHROPIC_API_KEY not configured", generated_at: new Date().toISOString() };
  }

  const highPriority = [];
  const trendingTopics = [];

  // Search for LinkedIn engagement opportunities (top 3 topics)
  const linkedinTopics = topics.slice(0, 3);
  for (const topic of linkedinTopics) {
    try {
      const result = await callClaudeSearch(
        `You are a LinkedIn engagement strategist for a federal health IT intelligence platform called Mission Meets Tech. Find recent, high-engagement LinkedIn posts or discussions from federal health IT leaders, GovCon executives, or policy makers about the given topic.

OUTPUT FORMAT — respond ONLY in this JSON structure, no markdown fences:
{
  "opportunities": [
    {
      "person_or_source": "Name and title",
      "title_or_context": "What they posted or discussed",
      "url": "LinkedIn URL if found, or 'search LinkedIn for: [terms]'",
      "why_engage": "Why MMT should engage with this (business value)",
      "suggested_comment": "A sharp, value-adding comment (max 2 sentences). No flattery. Add operational insight or ask a pointed question."
    }
  ]
}

COMMENT RULES:
- NO flattery ("great post!", "love this", "so important")
- NO generic agreement ("couldn't agree more")
- ADD operational value: a data point, a contrarian angle, or a sharp follow-up question
- MAX 2 sentences
- Sound like a practitioner, not a commenter`,
        `Find recent LinkedIn discussions or posts about: ${topic}\n\nSearch for federal health IT leaders, DHA officials, VA health tech leaders, or GovCon executives posting about this. Return up to 2 high-value engagement opportunities.`,
        {
          maxTokens: 1500,
          temperature: 0.2,
          supabase,
          functionName: "engagement-brief",
          product: "mmt-intel",
        }
      );

      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.opportunities) {
            highPriority.push(...parsed.opportunities.slice(0, 2));
          }
        }
      } catch {
        console.warn(`engagement-intel: failed to parse LinkedIn results for "${topic}"`);
      }
    } catch (err) {
      console.error(`engagement-intel: LinkedIn search failed for "${topic}":`, err.message);
    }
  }

  // Search for trending GovCon discussions (top 2 topics)
  const trendingSearch = topics.slice(0, 2);
  for (const topic of trendingSearch) {
    try {
      const result = await callClaudeSearch(
        `You are a federal contracting news analyst. Find the most important recent news or trending discussion about the given topic in the GovCon / federal health IT space from this week.

OUTPUT FORMAT — respond ONLY in this JSON structure, no markdown fences:
{
  "trends": [
    {
      "topic": "Specific trending topic",
      "source": "Where it's being discussed",
      "url": "URL to the discussion or article",
      "mmt_angle": "How MMT could create content or commentary on this",
      "urgency": "high | medium | low"
    }
  ]
}`,
        `What are the most important federal contracting or federal health IT news and discussions this week about: ${topic}?\n\nReturn up to 2 trending topics with specific sources.`,
        {
          maxTokens: 1200,
          temperature: 0.2,
          supabase,
          functionName: "engagement-brief",
          product: "mmt-intel",
        }
      );

      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.trends) {
            trendingTopics.push(...parsed.trends.slice(0, 2));
          }
        }
      } catch {
        console.warn(`engagement-intel: failed to parse trending results for "${topic}"`);
      }
    } catch (err) {
      console.error(`engagement-intel: trending search failed for "${topic}":`, err.message);
    }
  }

  return {
    high_priority: highPriority.slice(0, 5),
    trending_topics: trendingTopics.slice(0, 3),
    generated_at: new Date().toISOString(),
  };
}

module.exports = { generateEngagementBrief };
