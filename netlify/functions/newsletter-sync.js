// ============================================================
// newsletter-sync.js — Netlify Scheduled Function
//
// Runs Tuesday and Friday at 6 PM ET (23:00 UTC) to check for
// new Mission Meets Tech LinkedIn newsletter articles.
//
// Uses Perplexity API to search LinkedIn for new articles,
// compares against existing content, creates markdown stubs
// via GitHub API, and triggers a Netlify rebuild.
//
// Schedule configured in netlify.toml:
//   [functions."newsletter-sync"]
//     schedule = "0 23 * * 2,5"
// ============================================================

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const NETLIFY_BUILD_HOOK_URL = process.env.NETLIFY_BUILD_HOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const REPO_OWNER = "maryadawson-code";
const REPO_NAME = "mmt-site";
const CONTENT_PATH = "content/newsletter";
const LINKEDIN_NEWSLETTER_URL = "https://www.linkedin.com/newsletters/mission-meets-tech-7307800960485969920";

// Tag mapping based on content keywords
const TAG_RULES = [
  { keywords: ["VA ", "veteran", "VHA", "EHRM", "Oracle Health", "VistA", "IHT", "CCN"], tag: "Veterans Affairs" },
  { keywords: ["DHA", "MHS GENESIS", "DHMSM", "HCDS", "PEO DHMS", "MTF", "TRICARE", "military health"], tag: "Defense Health" },
  { keywords: ["AI ", "artificial intelligence", "GenAI", "machine learning", "ambient", "LLM"], tag: "AI & Innovation" },
  { keywords: ["contract", "procurement", "solicitation", "RFP", "protest", "FAR", "IDIQ", "set-aside", "SAM.gov"], tag: "Contracting & Procurement" },
  { keywords: ["CMS", "Medicare", "Medicaid", "HHS", "IHS", "rural health"], tag: "Federal Health Policy" },
  { keywords: ["cyber", "CMMC", "zero trust", "FOCI", "supply chain", "security"], tag: "Cybersecurity" },
  { keywords: ["interoperab", "FHIR", "HL7", "TEFCA", "health information exchange"], tag: "Interoperability" },
];

function detectTags(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const tags = [];
  for (const rule of TAG_RULES) {
    if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      tags.push(rule.tag);
    }
  }
  return tags.length > 0 ? tags : ["Federal Health Policy"];
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80)
    .replace(/-$/, "");
}

async function searchForNewArticles() {
  const today = new Date();
  const twoWeeksAgo = new Date(today - 14 * 24 * 60 * 60 * 1000);
  const dateStr = twoWeeksAgo.toISOString().split("T")[0];

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar",
      max_tokens: 2000,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You search for LinkedIn newsletter articles. Return ONLY valid JSON. No markdown fences.`,
        },
        {
          role: "user",
          content: `Search for the most recent articles from the "Mission Meets Tech" LinkedIn newsletter by Mary Womack (federal health IT). The newsletter URL is ${LINKEDIN_NEWSLETTER_URL}. Find articles published after ${dateStr}.

For each article found, return a JSON array of objects with these fields:
- "title": exact article title
- "date": publication date in YYYY-MM-DD format
- "url": full LinkedIn URL
- "description": 1-2 sentence summary of the article

Return ONLY the JSON array. If no new articles found, return [].`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  let text = data.choices?.[0]?.message?.content || "[]";

  // Clean up response
  text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  text = text.replace(/\[\d+\]/g, ""); // Remove citation markers

  try {
    const articles = JSON.parse(text);
    return Array.isArray(articles) ? articles : [];
  } catch {
    console.error("Failed to parse Perplexity response:", text.substring(0, 500));
    return [];
  }
}

async function getExistingArticles() {
  // List files in content/newsletter via GitHub API
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONTENT_PATH}`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    console.error("GitHub API error:", response.status);
    return new Set();
  }

  const files = await response.json();
  // Extract dates and partial slugs to match against
  const existing = new Set();
  for (const f of files) {
    if (f.name.endsWith(".md")) {
      // Extract date prefix (YYYY-MM-DD)
      const dateMatch = f.name.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) existing.add(dateMatch[1]);
      // Also store full filename without extension for exact match
      existing.add(f.name.replace(".md", ""));
    }
  }
  return existing;
}

async function createArticleFile(article) {
  const slug = slugify(article.title);
  const filename = `${article.date}-${slug}.md`;
  const tags = detectTags(article.title, article.description || "");
  const tagsYaml = tags.map((t) => `  - ${t}`).join("\n");

  const content = `---
title: "${article.title.replace(/"/g, '\\"')}"
date: ${article.date}
slug: ${slug}
description: "${(article.description || "").replace(/"/g, '\\"')}"
tags:
${tagsYaml}
linkedin_url: "${article.url}"
---

${article.description || article.title}

*Read the full edition on [LinkedIn](${article.url}).*
`;

  // Create file via GitHub API
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONTENT_PATH}/${filename}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `content: auto-sync "${article.title.substring(0, 50)}" from LinkedIn`,
        content: Buffer.from(content).toString("base64"),
        branch: "main",
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub create file error ${response.status}: ${err}`);
  }

  return filename;
}

async function triggerRebuild() {
  if (!NETLIFY_BUILD_HOOK_URL) {
    console.log("No NETLIFY_BUILD_HOOK_URL set, skipping rebuild trigger");
    return;
  }

  const response = await fetch(NETLIFY_BUILD_HOOK_URL, {
    method: "POST",
    body: JSON.stringify({}),
  });

  console.log(`Rebuild triggered: ${response.status}`);
}

async function logEvent(message, details) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.from("ops_events").insert({
      event_type: "newsletter_sync",
      source_function: "newsletter-sync",
      severity: "info",
      details: { message, ...details },
    });
  } catch { /* non-blocking */ }
}

exports.handler = async (event) => {
  console.log("Newsletter sync started:", new Date().toISOString());

  if (!PERPLEXITY_API_KEY || !GITHUB_TOKEN) {
    console.error("Missing required env vars (PERPLEXITY_API_KEY, GITHUB_TOKEN)");
    return { statusCode: 500, body: "Missing env vars" };
  }

  try {
    // 1. Search for new articles
    console.log("Searching for new LinkedIn articles...");
    const found = await searchForNewArticles();
    console.log(`Found ${found.length} articles from Perplexity search`);

    if (found.length === 0) {
      await logEvent("No new articles found", { searched: true });
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "no_new_articles", searched: true }),
      };
    }

    // 2. Get existing articles
    const existing = await getExistingArticles();
    console.log(`${existing.size} existing article identifiers`);

    // 3. Filter to only new articles
    const newArticles = found.filter((a) => {
      if (!a.date || !a.title || !a.url) return false;
      const slug = slugify(a.title);
      const filePrefix = `${a.date}-${slug}`;
      // Check if date already exists or full slug matches
      return !existing.has(a.date) && !existing.has(filePrefix);
    });

    console.log(`${newArticles.length} new articles to create`);

    if (newArticles.length === 0) {
      await logEvent("All articles already synced", {
        found: found.length,
        existing: existing.size,
      });
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "all_synced",
          found: found.length,
        }),
      };
    }

    // 4. Create markdown files
    const created = [];
    for (const article of newArticles) {
      try {
        const filename = await createArticleFile(article);
        created.push(filename);
        console.log(`Created: ${filename}`);
      } catch (err) {
        console.error(`Failed to create ${article.title}:`, err.message);
      }
    }

    // 5. Trigger rebuild if any files were created
    if (created.length > 0) {
      await triggerRebuild();
      await logEvent("New articles synced and rebuild triggered", {
        created,
        count: created.length,
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "synced",
        found: found.length,
        created: created.length,
        files: created,
      }),
    };
  } catch (err) {
    console.error("Newsletter sync error:", err.message, err.stack);
    await logEvent("Newsletter sync failed", { error: err.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
