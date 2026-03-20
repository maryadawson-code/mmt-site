// learning-engine.js — Self-learning engine for agents
// Agents read before work, write after. Fire-and-forget.

async function readLearnings(supabase, { agent, domain, limit = 50 }) {
  try {
    let query = supabase
      .from("agent_learnings")
      .select("id, rule, category, confidence, times_applied")
      .eq("is_active", true)
      .order("confidence", { ascending: false })
      .limit(limit);
    if (agent) query = query.eq("agent", agent);
    if (domain) query = query.eq("domain", domain);
    const { data } = await query;
    return data || [];
  } catch (err) {
    console.error("[learning-engine]", err.message);
    return [];
  }
}

async function recordLearning(supabase, { agent, category, domain, rule, context, source, sourceApprovalId, sourceIssueId, confidence }) {
  try {
    const { data } = await supabase.from("agent_learnings").insert({
      agent,
      category,
      domain,
      rule,
      context,
      source: source || "self",
      source_approval_id: sourceApprovalId || null,
      source_issue_id: sourceIssueId || null,
      confidence: confidence || 0.8,
    }).select("id").single();
    return data;
  } catch (err) {
    console.error("[learning-engine]", err.message);
    return null;
  }
}

async function learnFromRejection(supabase, { agent, approval, notes }) {
  return recordLearning(supabase, {
    agent,
    category: "correction",
    domain: mapCategoryToDomain(approval.category),
    rule: `Rejected: "${approval.title}". Feedback: ${notes}. Do not repeat.`,
    context: JSON.stringify({ category: approval.category, rejectionNotes: notes }),
    source: "human",
    sourceApprovalId: approval.id,
    confidence: 1.0,
  });
}

async function learnFromModification(supabase, { agent, approval, modifications }) {
  return recordLearning(supabase, {
    agent,
    category: "preference",
    domain: mapCategoryToDomain(approval.category),
    rule: `Modified before approval. Apply these changes next time: ${JSON.stringify(modifications).substring(0, 300)}`,
    source: "human",
    sourceApprovalId: approval.id,
    confidence: 0.9,
  });
}

function mapCategoryToDomain(category) {
  const map = {
    deploy: "code",
    architecture: "code",
    "schema-change": "code",
    dependency: "code",
    "spend-approval": "cost",
    "service-change": "cost",
    "customer-outreach": "customer",
    "sprint-change": "project",
    "newsletter-draft": "editorial",
    "linkedin-post": "editorial",
    "topic-pitch": "editorial",
    "report-review": "customer",
  };
  return map[category] || "general";
}

module.exports = { readLearnings, recordLearning, learnFromRejection, learnFromModification };
