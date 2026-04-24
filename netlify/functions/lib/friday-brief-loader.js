// ============================================================
// friday-brief-loader.js — read content/friday-briefs/YYYY-MM-DD.md,
// parse frontmatter, render HTML + plain-text fallback.
//
// Frontmatter schema:
//   title             (required)  — headline used in email subject + page h1
//   summary           (required)  — one-sentence preheader / meta description
//   tags              (optional)  — array of strings, informational
//   founding_variant  (optional)  — alternate body markdown for founding_member=true users
//
// Used by:
//   - scripts/publish-friday-brief.js (inserts scheduled_emails row)
//   - build.js (renders static HTML to premium/friday-briefs/<date>.html)
//
// Keeps rendering deterministic: same .md input → same HTML + text output.
// ============================================================

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");

const CONTENT_DIR = path.resolve(__dirname, "..", "..", "..", "content", "friday-briefs");

/**
 * Locate the markdown file for a given date.
 * Does NOT read or parse.
 * @returns {string|null} absolute path, or null if no file
 */
function briefPathForDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const p = path.join(CONTENT_DIR, `${dateStr}.md`);
  return fs.existsSync(p) ? p : null;
}

/**
 * Load + parse the Friday brief for the given date.
 * @param {string} dateStr YYYY-MM-DD
 * @returns {{date, filePath, frontmatter, body, founding_variant} | null}
 *   Returns null if file missing. Throws if frontmatter missing required fields.
 */
function loadFridayBrief(dateStr) {
  const filePath = briefPathForDate(dateStr);
  if (!filePath) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data || {};
  if (!fm.title || !fm.summary) {
    throw new Error(
      `friday-brief-loader: ${dateStr}.md missing required frontmatter (title, summary). Got keys: ${Object.keys(fm).join(",") || "none"}`
    );
  }
  return {
    date: dateStr,
    filePath,
    frontmatter: {
      title: fm.title,
      summary: fm.summary,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      has_founding_variant: typeof fm.founding_variant === "string" && fm.founding_variant.length > 0,
    },
    body: parsed.content || "",
    founding_variant: typeof fm.founding_variant === "string" ? fm.founding_variant : null,
  };
}

/**
 * Render an email-safe HTML string from a Friday brief markdown + frontmatter.
 * Inline styles only — Gmail/Outlook friendly. Light theme to match the rest
 * of the MMT email templates.
 *
 * @param {{date, frontmatter, body, isFoundingVariant?}} brief
 * @returns {string} full <!DOCTYPE html> document
 */
function renderBriefEmailHtml(brief, opts = {}) {
  const isFoundingVariant = !!opts.isFoundingVariant;
  const markdownSource =
    isFoundingVariant && brief.founding_variant ? brief.founding_variant : brief.body;
  const bodyHtml = marked.parse(markdownSource || "");
  const { title, summary } = brief.frontmatter;
  const displayDate = new Date(brief.date + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const badge = isFoundingVariant ? "MMT Friday Brief · Founding Member" : "MMT Friday Brief";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(displayDate)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0A192F;line-height:1.55;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(summary)}</div>
  <div style="max-width:640px;margin:0 auto;padding:24px;background:#FFFFFF;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#457B9D;margin-bottom:8px;">${escapeHtml(badge)}</div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">${escapeHtml(displayDate)}</div>
    <h1 style="font-size:26px;font-weight:800;color:#0A192F;margin:0 0 10px 0;line-height:1.25;">${escapeHtml(title)}</h1>
    <p style="font-size:15px;color:#4b5563;margin:0 0 24px 0;">${escapeHtml(summary)}</p>
    <div style="font-size:15px;color:#0A192F;">${bodyHtml}</div>
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0;">
    <p style="font-size:13px;color:#6b7280;margin:0;">
      Mission Meets Tech · Federal health IT intelligence.<br>
      You received this because you're an active MMT Premium subscriber.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Render the plain-text fallback body.
 * Strips markdown to a readable text form. Used as `text_body` on the
 * scheduled_emails row so email clients that disable HTML still get content.
 */
function renderBriefTextBody(brief, opts = {}) {
  const isFoundingVariant = !!opts.isFoundingVariant;
  const source =
    isFoundingVariant && brief.founding_variant ? brief.founding_variant : brief.body;
  const { title, summary } = brief.frontmatter;
  const displayDate = new Date(brief.date + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const cleaned = (source || "")
    .replace(/^#{1,6}\s+/gm, "") // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // links
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return (
    `MMT Friday Brief — ${displayDate}\n` +
    `${title}\n\n` +
    `${summary}\n\n` +
    `${cleaned}\n\n` +
    `—\n` +
    `Mission Meets Tech · Federal health IT intelligence.\n` +
    `You received this because you're an active MMT Premium subscriber.\n`
  );
}

/**
 * Render a static-site page (for premium/friday-briefs/<date>.html).
 * Standalone document; build.js inlines the Tailwind CSS via siteScriptTag
 * on top-level pages but Friday-brief pages are minimal — we ship with an
 * inline <style> block so the page stands alone if build-time CSS injection
 * is ever skipped.
 */
function renderBriefStaticPage(brief) {
  const bodyHtml = marked.parse(brief.body || "");
  const { title, summary } = brief.frontmatter;
  const displayDate = new Date(brief.date + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — MMT Friday Brief — ${escapeHtml(displayDate)}</title>
<meta name="description" content="${escapeHtml(summary)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:type" content="article">
<style>
  body { margin:0; padding:0; font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif; color:#0A192F; background:#FFFFFF; line-height:1.6; }
  .wrap { max-width:720px; margin:0 auto; padding:48px 24px; }
  .kicker { font-size:12px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#457B9D; margin-bottom:12px; }
  h1 { font-size:32px; font-weight:800; line-height:1.2; margin:0 0 12px 0; }
  .date { font-size:14px; color:#6b7280; margin-bottom:24px; }
  .summary { font-size:16px; color:#4b5563; margin-bottom:32px; font-style:italic; }
  .body { font-size:16px; }
  .body h2 { font-size:22px; font-weight:700; margin-top:32px; margin-bottom:12px; }
  .body h3 { font-size:18px; font-weight:700; margin-top:24px; margin-bottom:8px; }
  .body p { margin-bottom:16px; }
  .body a { color:#457B9D; text-decoration:underline; }
  .body ul, .body ol { margin-bottom:16px; padding-left:24px; }
  .body li { margin-bottom:6px; }
  hr { border:0; border-top:1px solid #e5e7eb; margin:40px 0; }
  .footer { font-size:13px; color:#6b7280; }
</style>
</head>
<body data-access="premium" data-early-access="false">
  <div class="wrap">
    <div class="kicker">MMT Friday Brief</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="date">${escapeHtml(displayDate)}</div>
    <p class="summary">${escapeHtml(summary)}</p>
    <div class="body">${bodyHtml}</div>
    <hr>
    <p class="footer">
      Mission Meets Tech · Federal health IT intelligence.<br>
      Premium subscribers only. <a href="/premium/dashboard.html">Back to dashboard</a> ·
      <a href="/pricing.html">Not a subscriber?</a>
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * List all Friday-brief markdown dates currently on disk.
 * Sorted newest-first. Only the YYYY-MM-DD prefix is used — files that
 * don't match the date-prefix pattern are ignored.
 */
function listAvailableBriefs() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ""))
    .sort()
    .reverse();
}

module.exports = {
  briefPathForDate,
  loadFridayBrief,
  renderBriefEmailHtml,
  renderBriefTextBody,
  renderBriefStaticPage,
  listAvailableBriefs,
  CONTENT_DIR,
};
