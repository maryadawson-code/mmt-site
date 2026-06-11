// billing-sync.js — Scheduled daily billing collector
// Schedule: 0 8 * * * (8 AM UTC = 4 AM ET)
// Collects charges from: Stripe, Anthropic (via cost_events), Netlify, Resend, Render, Gmail

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const results = {};

  const collectors = [
    { name: "stripe_billing", fn: collectStripe },
    { name: "anthropic_api", fn: collectAnthropic },
    { name: "netlify_api", fn: collectNetlify },
    { name: "resend_api", fn: collectResend },
    { name: "render_api", fn: collectRender },
    { name: "gmail_receipts", fn: collectGmail },
  ];

  for (const collector of collectors) {
    const { data: syncStatus } = await supabase
      .from("billing_sync_status")
      .select("is_enabled, config, sync_cursor, records_synced")
      .eq("source", collector.name)
      .single();

    if (!syncStatus?.is_enabled) {
      results[collector.name] = { skipped: true, reason: "disabled" };
      continue;
    }

    try {
      const result = await collector.fn(supabase, syncStatus);
      results[collector.name] = result;

      await supabase
        .from("billing_sync_status")
        .update({
          last_sync_at: new Date().toISOString(),
          last_success_at: result.errors?.length ? undefined : new Date().toISOString(),
          last_error: result.errors?.length ? result.errors.join("; ") : null,
          records_synced: (syncStatus.records_synced || 0) + (result.records || 0),
          sync_cursor: result.cursor || syncStatus.sync_cursor,
        })
        .eq("source", collector.name);
    } catch (err) {
      results[collector.name] = { error: err.message };
      await supabase
        .from("billing_sync_status")
        .update({ last_sync_at: new Date().toISOString(), last_error: err.message })
        .eq("source", collector.name);
    }
  }

  // Post-collection: recalculate summaries + match to inventory + alerts
  await recalculateMonthlySummary(supabase);
  await matchBillingToInventory(supabase);
  await checkBillingAlerts(supabase);

  // Log summary
  const { error: logErr } = await supabase.from("ops_events").insert({
    event_type: "billing_sync_complete",
    source_function: "billing-sync",
    details: results,
    severity: Object.values(results).some((r) => r.error) ? "warn" : "info",
  });
  if (logErr) console.error("billing-sync: ops_events insert failed (billing_sync_complete):", logErr.message);

  return { statusCode: 200, body: JSON.stringify(results) };
};

// ═══════════════════════════════════════
// COLLECTOR: STRIPE (our own charges + fees)
// ═══════════════════════════════════════

async function collectStripe(supabase, syncStatus) {
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  if (!process.env.STRIPE_SECRET_KEY) return { records: 0, errors: ["STRIPE_SECRET_KEY not set"] };

  let records = 0;
  const errors = [];

  try {
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const charges = await stripe.charges.list({ limit: 100, created: { gte: thirtyDaysAgo } });

    for (const charge of charges.data) {
      if (charge.balance_transaction) {
        let bt;
        try {
          bt = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
        } catch (e) {
          continue;
        }

        const feeCents = bt.fee || 0;
        if (feeCents > 0) {
          const chargeDate = new Date(charge.created * 1000).toISOString().split("T")[0];
          const dedupKey = `stripe_fee_${charge.id}`;

          const { error } = await supabase.from("billing_records").upsert(
            {
              service_name: "Stripe",
              charge_date: chargeDate,
              amount_cents: feeCents,
              description: `Stripe fee on $${(charge.amount / 100).toFixed(2)} charge (${charge.description || charge.id})`,
              source: "stripe_billing",
              source_ref: charge.id,
              category: "infrastructure",
              is_business: true,
              is_tax_deductible: true,
              matched_to_inventory: true,
              confidence: "high",
              dedup_key: dedupKey,
              metadata: { charge_amount: charge.amount, fee: feeCents, net: bt.net },
            },
            { onConflict: "dedup_key" }
          );

          if (!error) records++;
        }
      }
    }
  } catch (err) {
    errors.push("Stripe: " + err.message);
  }

  return { records, errors };
}

// ═══════════════════════════════════════
// COLLECTOR: ANTHROPIC (rollup from cost_events)
// ═══════════════════════════════════════

async function collectAnthropic(supabase, syncStatus) {
  let records = 0;
  const errors = [];

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: dailyCosts } = await supabase
      .from("cost_events")
      .select("created_at, cost_cents, provider")
      .eq("provider", "anthropic")
      .gte("created_at", thirtyDaysAgo);

    if (!dailyCosts || dailyCosts.length === 0) {
      return { records: 0, errors: [], note: "No Anthropic cost_events found" };
    }

    // Group by date
    const byDate = {};
    const countByDate = {};
    for (const event of dailyCosts) {
      const date = event.created_at.split("T")[0];
      byDate[date] = (byDate[date] || 0) + (event.cost_cents || 0);
      countByDate[date] = (countByDate[date] || 0) + 1;
    }

    for (const [date, totalCents] of Object.entries(byDate)) {
      if (totalCents === 0) continue;
      const dedupKey = `anthropic_daily_${date}`;

      const { error } = await supabase.from("billing_records").upsert(
        {
          service_name: "Anthropic API",
          charge_date: date,
          amount_cents: Math.round(totalCents),
          description: `Anthropic API usage (${countByDate[date]} calls)`,
          source: "anthropic_api",
          source_ref: `cost_events_${date}`,
          category: "infrastructure",
          is_business: true,
          is_tax_deductible: true,
          matched_to_inventory: true,
          confidence: "high",
          dedup_key: dedupKey,
          metadata: { call_count: countByDate[date] },
        },
        { onConflict: "dedup_key" }
      );

      if (!error) records++;
    }
  } catch (err) {
    errors.push("Anthropic: " + err.message);
  }

  return { records, errors };
}

// ═══════════════════════════════════════
// COLLECTOR: NETLIFY
// ═══════════════════════════════════════

async function collectNetlify(supabase, syncStatus) {
  let records = 0;
  const errors = [];

  try {
    const token = process.env.NETLIFY_AUTH_TOKEN;
    if (!token) return { records: 0, errors: ["NETLIFY_AUTH_TOKEN not set"] };

    const accountsResp = await fetch("https://api.netlify.com/api/v1/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!accountsResp.ok) return { records: 0, errors: [`Netlify API ${accountsResp.status}`] };

    const accounts = await accountsResp.json();

    for (const account of accounts) {
      try {
        const billingResp = await fetch(`https://api.netlify.com/api/v1/${account.slug}/billing`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (billingResp.ok) {
          const billing = await billingResp.json();
          if (billing.period) {
            const dedupKey = `netlify_${account.slug}_${billing.period}`;
            const { error } = await supabase.from("billing_records").upsert(
              {
                service_name: "Netlify",
                charge_date: billing.period || new Date().toISOString().split("T")[0],
                amount_cents: billing.amount ? Math.round(billing.amount * 100) : 1070,
                description: `Netlify ${account.name} — ${billing.plan || "Pro"}`,
                source: "netlify_api",
                source_ref: account.slug,
                category: "infrastructure",
                is_business: true,
                is_tax_deductible: true,
                matched_to_inventory: true,
                confidence: "high",
                dedup_key: dedupKey,
              },
              { onConflict: "dedup_key" }
            );
            if (!error) records++;
          }
        } else {
          // Billing endpoint may not exist — fall back to known rate
          const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
          const dedupKey = `netlify_known_${thisMonth}`;
          await supabase.from("billing_records").upsert(
            {
              service_name: "Netlify",
              charge_date: thisMonth,
              amount_cents: 1070,
              description: "Netlify Pro plan (known rate)",
              source: "netlify_api",
              source_ref: "known_rate",
              category: "infrastructure",
              is_business: true,
              is_tax_deductible: true,
              matched_to_inventory: true,
              confidence: "medium",
              dedup_key: dedupKey,
              needs_review: true,
            },
            { onConflict: "dedup_key" }
          );
          records++;
        }
      } catch (e) {
        const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
        const dedupKey = `netlify_known_${thisMonth}`;
        await supabase.from("billing_records").upsert(
          {
            service_name: "Netlify",
            charge_date: thisMonth,
            amount_cents: 1070,
            description: "Netlify Pro plan (known rate)",
            source: "netlify_api",
            source_ref: "known_rate",
            category: "infrastructure",
            is_business: true,
            is_tax_deductible: true,
            matched_to_inventory: true,
            confidence: "medium",
            dedup_key: dedupKey,
            needs_review: true,
          },
          { onConflict: "dedup_key" }
        );
        records++;
      }
    }

    // Track site usage metadata
    try {
      const sitesResp = await fetch("https://api.netlify.com/api/v1/sites?filter=all", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sitesResp.ok) {
        const sites = await sitesResp.json();
        const mmt = sites.find(
          (s) => s.name === "curious-pony" || s.custom_domain === "missionmeetstech.com"
        );
        if (mmt) {
          await supabase
            .from("billing_sync_status")
            .update({
              metadata: {
                site_id: mmt.id,
                deploys: mmt.published_deploy?.id,
                build_minutes: mmt.build_settings?.build_count,
              },
            })
            .eq("source", "netlify_api");
        }
      }
    } catch (e) {
      /* non-critical */
    }
  } catch (err) {
    errors.push("Netlify: " + err.message);
  }

  return { records, errors };
}

// ═══════════════════════════════════════
// COLLECTOR: RESEND
// ═══════════════════════════════════════

async function collectResend(supabase, syncStatus) {
  let records = 0;
  const errors = [];

  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { records: 0, errors: ["RESEND_API_KEY not set"] };

    const domainsResp = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!domainsResp.ok) return { records: 0, errors: [`Resend API ${domainsResp.status}`] };

    // Resend is $20/mo fixed — record known rate
    const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
    const dedupKey = `resend_known_${thisMonth}`;

    await supabase.from("billing_records").upsert(
      {
        service_name: "Resend",
        charge_date: thisMonth,
        amount_cents: 2000,
        description: "Resend Transactional Pro ($20/mo)",
        source: "resend_api",
        source_ref: "known_rate",
        category: "infrastructure",
        is_business: true,
        is_tax_deductible: true,
        matched_to_inventory: true,
        confidence: "medium",
        dedup_key: dedupKey,
        needs_review: false,
      },
      { onConflict: "dedup_key" }
    );
    records++;

    // Track email volume
    try {
      const emailsResp = await fetch("https://api.resend.com/emails?limit=100", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (emailsResp.ok) {
        const emails = await emailsResp.json();
        await supabase
          .from("billing_sync_status")
          .update({ metadata: { recent_email_count: emails.data?.length || 0, api_reachable: true } })
          .eq("source", "resend_api");
      }
    } catch (e) {
      /* non-critical */
    }
  } catch (err) {
    errors.push("Resend: " + err.message);
  }

  return { records, errors };
}

// ═══════════════════════════════════════
// COLLECTOR: RENDER
// ═══════════════════════════════════════

async function collectRender(supabase, syncStatus) {
  let records = 0;
  const errors = [];

  try {
    const key = process.env.RENDER_API_KEY;
    if (!key) {
      // No API key — record known rate
      const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
      const dedupKey = `render_known_${thisMonth}`;
      await supabase.from("billing_records").upsert(
        {
          service_name: "Render",
          charge_date: thisMonth,
          amount_cents: 2500,
          description: "Render 1 instance ($25/mo known rate)",
          source: "render_api",
          source_ref: "known_rate",
          category: "infrastructure",
          is_business: true,
          is_tax_deductible: true,
          matched_to_inventory: true,
          confidence: "medium",
          dedup_key: dedupKey,
          needs_review: true,
        },
        { onConflict: "dedup_key" }
      );
      return { records: 1, errors: ["RENDER_API_KEY not set — using known rate"] };
    }

    const resp = await fetch("https://api.render.com/v1/owners?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (resp.ok) {
      const owners = await resp.json();
      for (const owner of owners) {
        try {
          const billingResp = await fetch(`https://api.render.com/v1/owners/${owner.owner.id}/billing`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (billingResp.ok) {
            const billing = await billingResp.json();
            if (billing.amount) {
              const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
              const dedupKey = `render_${owner.owner.id}_${thisMonth}`;
              const { error } = await supabase.from("billing_records").upsert(
                {
                  service_name: "Render",
                  charge_date: thisMonth,
                  amount_cents: Math.round(billing.amount * 100),
                  description: `Render billing (${owner.owner.name || owner.owner.id})`,
                  source: "render_api",
                  source_ref: owner.owner.id,
                  category: "infrastructure",
                  is_business: true,
                  is_tax_deductible: true,
                  matched_to_inventory: true,
                  confidence: "high",
                  dedup_key: dedupKey,
                },
                { onConflict: "dedup_key" }
              );
              if (!error) records++;
            }
          }
        } catch (e) {
          /* billing endpoint may not exist */
        }
      }
    }
  } catch (err) {
    errors.push("Render: " + err.message);
  }

  return { records, errors };
}

// ═══════════════════════════════════════
// COLLECTOR: GMAIL RECEIPTS
// ═══════════════════════════════════════

async function collectGmail(supabase, syncStatus) {
  let records = 0;
  const errors = [];

  try {
    const { data: oauthToken } = await supabase
      .from("oauth_tokens")
      .select("*")
      .eq("provider", "google")
      .eq("is_active", true)
      .single();

    if (!oauthToken) return { records: 0, errors: ["Gmail OAuth not configured — run setup flow"] };

    // Refresh token if expired
    let accessToken = oauthToken.access_token;
    if (new Date(oauthToken.expires_at) < new Date()) {
      const refreshResult = await refreshGoogleToken(oauthToken.refresh_token);
      if (refreshResult.error) return { records: 0, errors: [`Token refresh failed: ${refreshResult.error}`] };

      accessToken = refreshResult.access_token;
      await supabase
        .from("oauth_tokens")
        .update({
          access_token: refreshResult.access_token,
          expires_at: new Date(Date.now() + refreshResult.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
        })
        .eq("id", oauthToken.id);
    }

    // Search for receipt/invoice emails
    const queries = [
      "subject:(receipt OR invoice OR payment OR charge OR subscription OR billing) newer_than:30d",
      "from:(noreply@stripe.com OR receipts@anthropic.com OR billing@netlify.com OR noreply@resend.com OR noreply@render.com OR no-reply@accounts.google.com OR noreply@email.apple.com OR receipt@linkedin.com OR notifications@plausible.io OR noreply@riverside.fm OR billing@sentry.io) newer_than:30d",
    ];

    for (const query of queries) {
      const searchResp = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!searchResp.ok) {
        errors.push(`Gmail search failed: ${searchResp.status}`);
        continue;
      }

      const searchData = await searchResp.json();
      const messages = searchData.messages || [];

      for (const msg of messages) {
        const dedupKey = `gmail_${msg.id}`;
        const { data: existing } = await supabase
          .from("billing_records")
          .select("id")
          .eq("dedup_key", dedupKey)
          .single();
        if (existing) continue;

        const msgResp = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgResp.ok) continue;
        const msgData = await msgResp.json();

        const parsed = parseReceiptEmail(msgData);
        if (!parsed) continue;

        const { error } = await supabase.from("billing_records").upsert(
          {
            service_name: parsed.serviceName,
            charge_date: parsed.date,
            amount_cents: parsed.amountCents,
            description: parsed.description,
            source: "gmail_receipts",
            source_ref: msg.id,
            source_url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
            category: parsed.category,
            is_business: parsed.isBusiness,
            is_tax_deductible: parsed.isTaxDeductible,
            confidence: parsed.confidence,
            needs_review: parsed.confidence !== "high",
            dedup_key: dedupKey,
            metadata: {
              from: parsed.from,
              subject: parsed.subject,
              snippet: msgData.snippet?.substring(0, 200),
            },
          },
          { onConflict: "dedup_key" }
        );

        if (!error) records++;
      }
    }

    return { records, errors, cursor: new Date().toISOString() };
  } catch (err) {
    errors.push("Gmail: " + err.message);
  }

  return { records, errors };
}

// ═══════════════════════════════════════
// RECEIPT PARSER
// ═══════════════════════════════════════

function parseReceiptEmail(msgData) {
  const headers = msgData.payload?.headers || [];
  const from = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
  const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
  const date = headers.find((h) => h.name.toLowerCase() === "date")?.value || "";
  const body = getEmailBody(msgData.payload);

  const patterns = [
    {
      match: () => from.includes("stripe.com"),
      parse: () => parseStripeReceipt(subject, body),
    },
    {
      match: () => from.includes("anthropic.com"),
      parse: () => ({
        serviceName: "Anthropic API",
        ...parseAmount(body, subject),
        category: "infrastructure",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
    {
      match: () => from.includes("netlify.com"),
      parse: () => ({
        serviceName: "Netlify",
        ...parseAmount(body, subject),
        category: "infrastructure",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
    {
      match: () => from.includes("resend.com"),
      parse: () => ({
        serviceName: "Resend",
        ...parseAmount(body, subject),
        category: "infrastructure",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
    {
      match: () => from.includes("render.com"),
      parse: () => ({
        serviceName: "Render",
        ...parseAmount(body, subject),
        category: "infrastructure",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
    {
      match: () =>
        from.includes("apple.com") && (subject.toLowerCase().includes("receipt") || body.includes("Apple ID")),
      parse: () => parseAppleReceipt(subject, body),
    },
    {
      match: () => from.includes("linkedin.com"),
      parse: () => ({
        serviceName: "LinkedIn Premium",
        ...parseAmount(body, subject),
        category: "productivity",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
    {
      match: () => from.includes("plausible.io"),
      parse: () => ({
        serviceName: "Plausible Analytics",
        ...parseAmount(body, subject),
        category: "infrastructure",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
    {
      match: () =>
        from.includes("google.com") &&
        (subject.includes("payment") || subject.includes("receipt") || body.includes("Google Workspace")),
      parse: () => parseGoogleReceipt(subject, body),
    },
    {
      match: () => from.includes("riverside.fm"),
      parse: () => ({
        serviceName: "Riverside.fm",
        ...parseAmount(body, subject),
        category: "infrastructure",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
    {
      match: () => from.includes("sentry.io"),
      parse: () => ({
        serviceName: "Sentry",
        ...parseAmount(body, subject),
        category: "infrastructure",
        isBusiness: true,
        isTaxDeductible: true,
        confidence: "high",
      }),
    },
  ];

  for (const pattern of patterns) {
    if (pattern.match()) {
      try {
        const result = pattern.parse();
        if (result && result.amountCents > 0) {
          return { ...result, from, subject, date: parseDate(date) };
        }
      } catch (e) {
        /* try next pattern */
      }
    }
  }

  // Unknown sender — try generic amount extraction
  const generic = parseAmount(body, subject);
  if (generic.amountCents > 0) {
    return {
      serviceName: extractServiceName(from, subject),
      ...generic,
      from,
      subject,
      date: parseDate(date),
      category: "unknown",
      isBusiness: false,
      isTaxDeductible: false,
      confidence: "low",
      description: `Unrecognized charge from ${from}: ${subject}`,
    };
  }

  return null;
}

function parseAmount(text, subject) {
  const combined = (subject || "") + " " + (text || "");
  const patterns = [
    /\$(\d{1,5}\.\d{2})/,
    /USD\s*(\d{1,5}\.\d{2})/,
    /Total[:\s]*\$?(\d{1,5}\.\d{2})/i,
    /Amount[:\s]*\$?(\d{1,5}\.\d{2})/i,
    /Charged?[:\s]*\$?(\d{1,5}\.\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match) {
      return {
        amountCents: Math.round(parseFloat(match[1]) * 100),
        description: subject || "Receipt",
      };
    }
  }

  return { amountCents: 0, description: subject || "No amount found" };
}

function parseStripeReceipt(subject, body) {
  const amount = parseAmount(body, subject);
  const nameMatch = body.match(/Payment to (.+?)[\n\r<]/);
  return {
    serviceName: nameMatch ? nameMatch[1].trim() : "Stripe Charge",
    ...amount,
    category: "infrastructure",
    isBusiness: true,
    isTaxDeductible: true,
    confidence: "high",
  };
}

function parseAppleReceipt(subject, body) {
  const serviceMap = {
    LinkedIn: { name: "LinkedIn Premium", category: "productivity", business: true },
    Grok: { name: "Grok SuperGrok", category: "ai-tools", business: false },
    YouTube: { name: "YouTube Premium", category: "personal", business: false },
    ClassDojo: { name: "ClassDojo Plus", category: "family", business: false },
    Roblox: { name: "Roblox Premium 450", category: "family", business: false },
    Perplexity: { name: "Perplexity MAX", category: "ai-tools", business: true },
    Genspark: { name: "Genspark Plus", category: "ai-tools", business: true },
    Cue: { name: "Cue AI", category: "productivity", business: false },
    Otter: { name: "Otter.ai", category: "productivity", business: true },
    "Heart Beat": { name: "Heart Beat App", category: "personal", business: false },
  };

  const amount = parseAmount(body, subject);

  for (const [key, info] of Object.entries(serviceMap)) {
    if (body.includes(key) || subject.includes(key)) {
      return {
        serviceName: info.name,
        ...amount,
        category: info.category,
        isBusiness: info.business,
        isTaxDeductible: info.business,
        confidence: "high",
      };
    }
  }

  return {
    serviceName: "Apple Subscription",
    ...amount,
    category: "unknown",
    isBusiness: false,
    isTaxDeductible: false,
    confidence: "medium",
  };
}

function parseGoogleReceipt(subject, body) {
  const amount = parseAmount(body, subject);
  if (body.includes("Workspace") || body.includes("Google One") || body.includes("Google AI")) {
    const name = body.includes("Workspace")
      ? "Google Workspace"
      : body.includes("AI")
        ? "Google AI Pro"
        : "Google Subscription";
    return {
      serviceName: name,
      ...amount,
      category: name === "Google Workspace" ? "infrastructure" : "ai-tools",
      isBusiness: true,
      isTaxDeductible: true,
      confidence: "high",
    };
  }
  return {
    serviceName: "Google",
    ...amount,
    category: "infrastructure",
    isBusiness: true,
    isTaxDeductible: true,
    confidence: "medium",
  };
}

function extractServiceName(from, subject) {
  const match = from.match(/[<"]?([^<"@]+)@/);
  if (match) return match[1].trim();
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch) return nameMatch[1].trim();
  return "Unknown Service";
}

function getEmailBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) return Buffer.from(payload.body.data, "base64").toString("utf8");
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf8");
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf8").replace(/<[^>]+>/g, " ");
      }
    }
  }
  return "";
}

function parseDate(dateStr) {
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

async function refreshGoogleToken(refreshToken) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  return resp.json();
}

// ═══════════════════════════════════════
// MATCHER: Link billing records to service inventory
// ═══════════════════════════════════════

async function matchBillingToInventory(supabase) {
  const { data: unmatched } = await supabase
    .from("billing_records")
    .select("id, service_name")
    .eq("matched_to_inventory", false);

  if (!unmatched || unmatched.length === 0) return;

  const { data: services } = await supabase.from("service_inventory").select("id, service_name");

  const serviceMap = new Map((services || []).map((s) => [s.service_name.toLowerCase(), s.id]));

  for (const record of unmatched) {
    const serviceId = serviceMap.get(record.service_name.toLowerCase());
    if (serviceId) {
      await supabase
        .from("billing_records")
        .update({ matched_to_inventory: true, service_id: serviceId })
        .eq("id", record.id);
    }
  }
}

// ═══════════════════════════════════════
// MONTHLY SUMMARY RECALCULATION
// ═══════════════════════════════════════

async function recalculateMonthlySummary(supabase) {
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7) + "-01";

  for (const month of [thisMonth, lastMonth]) {
    const nextMonth = new Date(new Date(month).getTime() + 32 * 86400000).toISOString().slice(0, 7) + "-01";

    const { data: records } = await supabase
      .from("billing_records")
      .select("amount_cents, category, is_business, is_tax_deductible, source, needs_review, matched_to_inventory")
      .gte("charge_date", month)
      .lt("charge_date", nextMonth);

    if (!records) continue;

    const summary = {
      month,
      total_cents: records.reduce((s, r) => s + r.amount_cents, 0),
      business_cents: records.filter((r) => r.is_business).reduce((s, r) => s + r.amount_cents, 0),
      personal_cents: records.filter((r) => !r.is_business).reduce((s, r) => s + r.amount_cents, 0),
      tax_deductible_cents: records.filter((r) => r.is_tax_deductible).reduce((s, r) => s + r.amount_cents, 0),
      infrastructure_cents: records.filter((r) => r.category === "infrastructure").reduce((s, r) => s + r.amount_cents, 0),
      ai_tools_cents: records.filter((r) => r.category === "ai-tools").reduce((s, r) => s + r.amount_cents, 0),
      productivity_cents: records.filter((r) => r.category === "productivity").reduce((s, r) => s + r.amount_cents, 0),
      domains_cents: records.filter((r) => r.category === "domains").reduce((s, r) => s + r.amount_cents, 0),
      personal_subs_cents: records.filter((r) => r.category === "personal").reduce((s, r) => s + r.amount_cents, 0),
      family_cents: records.filter((r) => r.category === "family").reduce((s, r) => s + r.amount_cents, 0),
      sources_synced: [...new Set(records.map((r) => r.source))],
      records_count: records.length,
      unmatched_count: records.filter((r) => !r.matched_to_inventory).length,
      needs_review_count: records.filter((r) => r.needs_review).length,
    };

    await supabase.from("monthly_cost_summary").upsert(summary, { onConflict: "month" });
  }
}

// ═══════════════════════════════════════
// RECONCILIATION ALERTS
// ═══════════════════════════════════════

async function checkBillingAlerts(supabase) {
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
  const dayOfMonth = new Date().getDate();

  // 1. Missing expected charges (after the 15th)
  if (dayOfMonth >= 15) {
    const { data: services } = await supabase
      .from("service_inventory")
      .select("service_name, monthly_cost_cents, billing_cycle")
      .eq("status", "active")
      .gt("monthly_cost_cents", 0)
      .eq("billing_cycle", "monthly");

    for (const svc of services || []) {
      const { data: charges } = await supabase
        .from("billing_records")
        .select("id")
        .eq("service_name", svc.service_name)
        .gte("charge_date", thisMonth)
        .limit(1);

      if (!charges || charges.length === 0) {
        await supabase.from("finance_alerts").insert({
          alert_type: "missing_charge",
          severity: "medium",
          source: "billing_reconciliation",
          title: `No ${svc.service_name} charge found this month`,
          description: `Expected ~$${(svc.monthly_cost_cents / 100).toFixed(2)}/mo but no billing record found for ${thisMonth}. Service may have been cancelled, billing date may be later in the month, or the receipt wasn't captured.`,
          recommended_action: `Verify at ${svc.service_name} dashboard or check email for receipt.`,
          metadata: { service: svc.service_name, expected_cents: svc.monthly_cost_cents },
        });
      }
    }
  }

  // 2. Unexpected charges (not in service inventory)
  const { data: unmatched } = await supabase
    .from("billing_records")
    .select("id, service_name, amount_cents, charge_date, source")
    .eq("matched_to_inventory", false)
    .eq("needs_review", true)
    .eq("reviewed", false)
    .gte("charge_date", thisMonth);

  for (const record of unmatched || []) {
    await supabase.from("finance_alerts").insert({
      alert_type: "unknown_charge",
      severity: record.amount_cents > 5000 ? "high" : "low",
      source: "billing_reconciliation",
      title: `Unrecognized charge: ${record.service_name} — $${(record.amount_cents / 100).toFixed(2)}`,
      description: `Found via ${record.source} on ${record.charge_date}. Not in service inventory.`,
      recommended_action: "Review and categorize in the Billing dashboard.",
      metadata: { billing_record_id: record.id },
    });
  }
}
