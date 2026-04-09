// competitive-scan.js — Weekly competitive intelligence scan
// Schedule: 0 14 * * 1 (Monday 2PM UTC / 10AM ET)
// Uses Claude + web_search to research competitors, creates alerts for new developments

const { createClient } = require("@supabase/supabase-js");
const { callClaudeSearch } = require("./lib/claude-search");

exports.handler = async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const results = { scanned: 0, alerts: 0, errors: [] };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[competitive-scan] No ANTHROPIC_API_KEY, skipping");
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "No API key" }) };
  }

  const { data: competitors } = await sb.from("competitors").select("*").order("overlap_score", { ascending: false });

  for (const comp of competitors || []) {
    try {
      const query = `What are the latest news, product updates, pricing changes, or announcements from ${comp.name} (${comp.website}) in the last 7 days? Focus on: new products, pricing changes, funding, partnerships, government contracts. Be specific with dates and sources.`;

      const result = await callClaudeSearch(
        "You are a competitive intelligence analyst. Be specific with dates and sources.",
        query,
        { maxTokens: 1000, temperature: 0.3, supabase: sb, functionName: "competitive-scan", product: "mmt-intel" }
      );
      const content = result.content || "";

      // Check if there's anything new compared to last research
      const hasNewInfo = content.length > 100
        && !content.toLowerCase().includes("no recent news")
        && !content.toLowerCase().includes("no significant updates")
        && !content.toLowerCase().includes("i couldn't find");

      if (hasNewInfo) {
        // Determine alert type from content
        let alertType = "general";
        const lc = content.toLowerCase();
        if (lc.includes("pricing") || lc.includes("price")) alertType = "pricing_change";
        else if (lc.includes("funding") || lc.includes("raised")) alertType = "funding";
        else if (lc.includes("product") || lc.includes("launch") || lc.includes("feature")) alertType = "product_update";
        else if (lc.includes("contract") || lc.includes("award") || lc.includes("government")) alertType = "contract_win";
        else if (lc.includes("partnership") || lc.includes("partner")) alertType = "partnership";

        await sb.from("competitive_alerts").insert({
          competitor_id: comp.id,
          competitor_name: comp.name,
          alert_type: alertType,
          title: `${comp.name}: ${alertType.replace("_", " ")} detected`,
          description: content.substring(0, 1000),
          impact: comp.overlap_score >= 50 ? "high" : "medium",
        });
        results.alerts++;
      }

      // Update last_researched timestamp and notes
      await sb.from("competitors").update({
        last_researched_at: new Date().toISOString(),
        research_notes: content.substring(0, 2000),
        updated_at: new Date().toISOString(),
      }).eq("id", comp.id);

      results.scanned++;
    } catch (err) {
      results.errors.push({ competitor: comp.name, error: err.message });
    }
  }

  console.log("[competitive-scan]", JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify(results) };
};
