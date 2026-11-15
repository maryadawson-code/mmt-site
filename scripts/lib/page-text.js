// page-text.js: turn one published HTML page into the text a reader sees,
// split by who may see it.
//
// The page index (scripts/build-site-index.js) feeds the site help widget,
// and the widget answers signed-out visitors from public text ONLY. So the
// split is the contract: text inside an element the site shows to members
// only is member text, everything else on the page is public text, and page
// chrome is neither.
//
// The site marks a members-only element three ways (js/mmt-paywall.js):
//   data-access="premium"   hidden by CSS until the tier is confirmed; on an
//                           <article> shell it gates the article body
//   data-gate="premium"     shown by script to premium only
//   data-gate="subscriber"  shown by script to signed-in accounts only
// data-access="free" / "email" and data-gate="public" / "anonymous" are
// shown to everyone. A page that gates with script alone carries no marker
// this file can see; build-site-index.js lists those pages by URL and
// scripts/validate-site-index.js fails the build when a new one appears.
//
// No DOM library: the build has none in `dependencies`, and a tag walk with a
// stack is enough for "which bucket is this text in". It tolerates the
// unclosed <p>/<li> the site's templates emit by closing back to the nearest
// matching open tag.

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

// Elements whose text is chrome or control labels, not page content.
const SKIPPED_TAGS = new Set(["nav", "header", "footer", "form", "svg", "iframe", "select", "textarea", "button", "noscript", "template"]);

// Raw-text elements are removed before the walk: their bodies can hold "<".
const RAW_TEXT_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

const ACCESS_ATTR_RE = /\bdata-access\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const GATE_ATTR_RE = /\bdata-gate\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
// data-gate values the paywall script shows to a visitor with no account.
const OPEN_GATES = new Set(["public", "anonymous"]);
// The dashboard shell's side navigation and the premium pages' top link bar
// are <div>s, not <nav>s.
const CHROME_CLASS_RE = /\bclass\s*=\s*["'][^"']*\b(dash-nav|premium-topbar|skip-link|sr-only)\b/i;

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", mdash: "—", ndash: "–",
  rarr: "→", larr: "←", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  copy: "©", reg: "®", trade: "™", times: "×", bull: "•", starf: "★", check: "✓",
};

function decodeEntities(text) {
  return String(text || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    const hit = NAMED_ENTITIES[body.toLowerCase()];
    return hit === undefined ? " " : hit;
  });
}

function squash(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function firstMatch(html, re) {
  const m = re.exec(html);
  return m ? squash(m[1] !== undefined ? m[1] : m[2]) : "";
}

function attrValue(attrs, re) {
  const m = re.exec(attrs);
  return m ? String(m[1] || m[2] || m[3] || "").trim().toLowerCase() : null;
}

/** Does this opening tag mark an element the site shows to members only? */
function isMemberOnly(attrs) {
  if (attrValue(attrs, ACCESS_ATTR_RE) === "premium") return true;
  const gate = attrValue(attrs, GATE_ATTR_RE);
  return gate !== null && !OPEN_GATES.has(gate);
}

// " · MMT Premium", " | Mission Meets Tech", " — Contract Tracker" and the
// like name the section, not the page. Left on, every premium page matches
// the word "premium" and every contract page the word "tracker".
const TITLE_SUFFIX_RE = /\s*[·|–—-]\s*(MMT Premium|MMT|Mission Meets Tech Glossary|Mission Meets Tech|Premium|Contract Tracker)\s*$/i;

function cleanTitle(raw) {
  let title = squash(raw);
  for (let i = 0; i < 3 && TITLE_SUFFIX_RE.test(title); i += 1) title = title.replace(TITLE_SUFFIX_RE, "");
  return title;
}

/** Close back to the nearest open `tag`; a stray closing tag is ignored. */
function closeTag(stack, tag) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].tag === tag) {
      stack.length = i;
      return;
    }
  }
}

/** The page body's text in two buckets. `hasGate`: a members-only element was seen. */
function splitBody(body) {
  const stack = []; // { tag, skip, member }
  const buckets = { public: [], member: [] };
  let hasGate = false;
  let cursor = 0;

  // Whitespace is kept (squash collapses it later): a <br> or a block
  // boundary is a word boundary, and dropping it glues two words together.
  const take = (text) => {
    if (!text || stack.some((el) => el.skip)) return;
    buckets[stack.some((el) => el.member) ? "member" : "public"].push(text);
  };

  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(body)) !== null) {
    take(body.slice(cursor, m.index));
    cursor = TAG_RE.lastIndex;
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";
    if (tag === "body" || tag === "html") continue;
    if (m[1] === "/") closeTag(stack, tag);
    else if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(attrs)) {
      const member = isMemberOnly(attrs);
      if (member) hasGate = true;
      stack.push({ tag, skip: SKIPPED_TAGS.has(tag) || CHROME_CLASS_RE.test(attrs), member });
    }
    take(" ");
  }
  take(body.slice(cursor));
  return { publicText: squash(buckets.public.join("")), memberText: squash(buckets.member.join("")), hasGate };
}

/**
 * @param {string} html one page from dist/
 * @returns {{ title: string, description: string, isRedirect: boolean,
 *   hasGate: boolean, publicText: string, memberText: string }}
 */
function extractPage(html) {
  const source = String(html || "");
  const bodyStart = source.search(/<body\b/i);
  const head = bodyStart > -1 ? source.slice(0, bodyStart) : source;
  const body = (bodyStart > -1 ? source.slice(bodyStart) : source).replace(COMMENT_RE, " ").replace(RAW_TEXT_RE, " ");
  return {
    title: cleanTitle(firstMatch(head, /<title[^>]*>([\s\S]*?)<\/title>/i)),
    description: firstMatch(head, /<meta\s+name=["']description["']\s+content=(?:"([^"]*)"|'([^']*)')/i),
    isRedirect: /<meta\s+http-equiv=["']refresh["']/i.test(head),
    ...splitBody(body),
  };
}

module.exports = { extractPage, isMemberOnly, decodeEntities, cleanTitle };
