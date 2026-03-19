// issue-hooks.js — Auto-create issues from system events

async function autoCreateIssue(supabase, { title, category, source, product, severity, errorLogs, rootCause, suggestedFix, affectedFiles, assignAgent }) {
  try {
    const { data: existing } = await supabase
      .from("issues")
      .select("id")
      .eq("title", title)
      .not("status", "in", '("closed","wont-fix")')
      .single();
    if (existing) return existing;

    const { data } = await supabase.from("issues").insert({
      title,
      category: category || "bug",
      source: source || "system",
      product,
      severity: severity || "medium",
      error_logs: errorLogs,
      root_cause: rootCause,
      suggested_fix: suggestedFix,
      affected_files: affectedFiles,
      assigned_agent: assignAgent || "ops-code",
    }).select("id").single();
    return data;
  } catch (err) {
    console.error("[issue-hooks]", err.message);
    return null;
  }
}

module.exports = { autoCreateIssue };
