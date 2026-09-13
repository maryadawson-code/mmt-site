// ============================================================
// glossary-extract.js — glossary.html -> structured terms
//
// The glossary lives only as HTML (42 term-entry blocks). The content
// corpus builder already knew how to ingest a glossary.json that never
// existed; this extractor reads the page directly so the glossary is in
// the Ask MMT corpus and the acronym reference without a second file to
// keep in sync. Each entry: term (the acronym or name), expansion (the
// teal line under it), definition, contractor note, tags, anchor.
// ============================================================

const fs = require("fs");

function decode(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} html - the glossary page source
 * @returns {Array<{id, slug, term, expansion, definition, contractor_note, tags, url}>}
 */
function extractGlossary(html) {
  const out = [];
  const chunks = String(html || "").split('<div class="term-entry"').slice(1);
  for (const chunk of chunks) {
    const attrEnd = chunk.indexOf(">");
    if (attrEnd < 0) continue;
    const attrs = chunk.slice(0, attrEnd);
    const body = chunk.slice(attrEnd + 1, chunk.indexOf("</div>") > -1 ? chunk.indexOf("</div>") : undefined);
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
    const tags = ((attrs.match(/data-tags="([^"]*)"/) || [])[1] || "").split(/\s+/).filter(Boolean);
    const term = decode((body.match(/<p class="text-lg[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "");
    const expansion = decode((body.match(/<p class="text-sm font-medium[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
    const definition = decode((body.match(/<p class="text-sm leading-relaxed[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
    const note = decode((body.match(/contractor-note-gated[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "").replace(/^Contractor note:\s*/i, "");
    if (!term) continue;
    const slug = id.replace(/^term-/, "") || term.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    out.push({
      id: id || `term-${slug}`,
      slug,
      term,
      expansion: expansion && expansion.toLowerCase() !== term.toLowerCase() ? expansion : "",
      definition,
      contractor_note: note,
      tags,
      url: `/glossary.html#${id || `term-${slug}`}`,
    });
  }
  return out;
}

function extractGlossaryFile(path) {
  if (!fs.existsSync(path)) return [];
  return extractGlossary(fs.readFileSync(path, "utf8"));
}

module.exports = { extractGlossary, extractGlossaryFile };
