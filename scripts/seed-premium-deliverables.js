#!/usr/bin/env node
// Seeds 10 scrubbed-stub migrations into the premium_deliverables table
// (recovered content from commit f6cfe41^ via scripts/extract-pre-scrub-content.js).
//
// Schema reference: migrations/20260423000000_capture_corner_scheduling.sql
//   - slug: text NOT NULL UNIQUE (URL slug with leading slash, e.g. "/premium/monthly/2026-04")
//   - title: text NOT NULL
//   - body_markdown: text NOT NULL (HTML is allowed — marked.parse() passes raw HTML through)
//   - publish_at: timestamptz NOT NULL
//   - published: boolean NOT NULL DEFAULT false
//   - is_capture_corner_release: boolean DEFAULT false
//   - release_id: text NOT NULL
//   - source_file: text (provenance)
//
// Env required: SUPABASE_URL, SUPABASE_SERVICE_KEY.
// Run: node scripts/seed-premium-deliverables.js [--dry-run]
//
// Idempotent: uses upsert on slug. Re-running will overwrite body_markdown
// with the freshly-extracted version (useful if seed-data is regenerated).

const fs = require("fs");
const path = require("path");

const SEED_DIR = path.join(__dirname, "seed-data");
const DRY_RUN = process.argv.includes("--dry-run");

function parseMeta(raw) {
  const meta = {};
  const re = /<!--\s*([a-z_]+):\s*([^>]*?)\s*-->/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    meta[m[1].toLowerCase()] = m[2].trim();
  }
  return meta;
}

function extractStyleBlock(raw) {
  // Capture <style>...</style> from the original <head>. We re-emit it
  // inside body_markdown so .brief-body / .kpi / .pinned / etc. classes
  // render with their original styling inside the render-fn portal shell.
  const m = raw.match(/<style>([\s\S]*?)<\/style>/i);
  return m ? m[1].trim() : "";
}

function extractMainContent(raw) {
  // Slice from <h1> through the closing </main> tag. This keeps the
  // article H1, intro paragraph, pinned cadence note, and the gated body —
  // and drops the back-link <a> + the <nav class="nav-editorial"></nav>
  // header which is irrelevant inside the portal.
  const startMatch = raw.match(/<h1[^>]*>/i);
  if (!startMatch) return null;
  const start = startMatch.index;
  const endMatch = raw.slice(start).search(/<\/main>/i);
  if (endMatch < 0) return null;
  let body = raw.slice(start, start + endMatch);
  // The pre-scrub files wrap the article body in
  // <div data-gate="premium" style="display:none;">...</div>. The render fn
  // already handles entitlement server-side — strip the inline display:none
  // so the content actually appears.
  body = body.replace(
    /<div\s+data-gate="premium"\s+style="display:none;?"\s*>/gi,
    '<div data-gate="premium">'
  );
  return body.trim();
}

function publishDateFromSlug(slug) {
  // /premium/monthly/2026-04 → 2026-04-01
  // /premium/briefs/2026-04-04 → 2026-04-04
  // /premium/capture-corner/2026-04-21 → 2026-04-21
  // /premium/briefs/rhrp-2026-04 → 2026-04-01
  const yyyymmdd = slug.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (yyyymmdd) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}T12:00:00Z`;
  const yyyymm = slug.match(/(\d{4})-(\d{2})/);
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2]}-01T12:00:00Z`;
  throw new Error(`Cannot derive publish_at from slug: ${slug}`);
}

async function main() {
  if (!fs.existsSync(SEED_DIR)) {
    console.error(`seed dir missing: ${SEED_DIR}. Run scripts/extract-pre-scrub-content.js first.`);
    process.exit(1);
  }
  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".html"));
  if (!files.length) {
    console.error("no .html files in seed dir.");
    process.exit(1);
  }

  const rows = files.map((file) => {
    const raw = fs.readFileSync(path.join(SEED_DIR, file), "utf8");
    const meta = parseMeta(raw);
    if (!meta.slug) throw new Error(`${file}: missing <!-- slug: --> header`);
    if (!meta.release_id) throw new Error(`${file}: missing <!-- release_id: --> header`);
    const styles = extractStyleBlock(raw);
    const main = extractMainContent(raw);
    if (!main) throw new Error(`${file}: could not extract <main> content`);
    const body_markdown =
      (styles ? `<style>${styles}</style>\n\n` : "") + main;
    return {
      slug: meta.slug,
      release_id: meta.release_id,
      title: meta.title || file,
      body_markdown,
      publish_at: publishDateFromSlug(meta.slug),
      published: true,
      is_capture_corner_release: meta.is_capture_corner_release === "true",
      source_file: meta.source || `recovered from f6cfe41^ via ${file}`,
    };
  });

  console.log(`Prepared ${rows.length} upsert rows:`);
  rows.forEach((r) => {
    console.log(`  ${r.slug}  (${r.body_markdown.length} bytes, publish_at=${r.publish_at}, capture_corner=${r.is_capture_corner_release})`);
  });

  if (DRY_RUN) {
    console.log("\n--dry-run set, not upserting. Exit.");
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("\nMissing SUPABASE_URL or SUPABASE_SERVICE_KEY in env.");
    console.error("Run from the main repo with prod creds, or set them explicitly:");
    console.error("  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-premium-deliverables.js");
    process.exit(2);
  }
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let ok = 0, failed = 0;
  for (const row of rows) {
    const { error } = await supabase
      .from("premium_deliverables")
      .upsert(row, { onConflict: "slug" });
    if (error) {
      console.error(`  ✗ ${row.slug}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${row.slug}`);
      ok++;
    }
  }
  console.log(`\nUpserted: ${ok}  Failed: ${failed}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
