// page-text.js: turn one published HTML page into the text a reader sees,
// split by who may see it.
//
// The page index (scripts/build-site-index.js) feeds the site help widget,
// and the widget answers signed-out visitors. So the split is the contract:
// text inside a [data-access="premium"] element is member text, everything
// else on the page is public text, and page chrome is neither.
//
// No DOM library: the build has none in `dependencies`, and a tag walk with a
// stack is enough for "which bucket is this text in". It tolerates the
// unclosed <p>/<li> the site's templates emit by closing back to the nearest
// matching open tag.

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

// Elements whose text is chrome or control labels, not page content.
const SKIPPED_TAGS = new Set(["nav", "footer", "svg", "iframe", "select", "textarea", "button", "noscript", "template"]);

// Raw-text elements are removed before the walk: their bodies can hold "<".
const RAW_TEXT_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

const PREMIUM_ATTR_RE = /\bdata-access\s*=\s*["']?premium\b/i;
// The dashboard shell's side navigation is a <div>/<aside>, not a <nav>.
const CHROME_CLASS_RE = /\bclass\s*=\s*["'][^"']*\b(dash-nav|skip-link|sr-only)\b/i;

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

function attr(html, re) {
  const m = re.exec(html);
  return m ? squash(m[1] !== undefined ? m[1] : m[2]) : "";
}

// " · MMT Premium", " | Mission Meets Tech" and the like say nothing about
// the page and would make every premium page match the word "premium".
const TITLE_SUFFIX_RE = /\s*[·|–—-]\s*(MMT Premium|MMT|Mission Meets Tech|Premium)\s*$/i;

function cleanTitle(raw) {
  let title = squash(raw);
  for (let i = 0; i < 3 && TITLE_SUFFIX_RE.test(title); i += 1) title = title.replace(TITLE_SUFFIX_RE, "");
  return title;
}

/**
 * @param {string} html one page from dist/
 * @returns {{
 *   title: string, description: string, isRedirect: boolean, hasGate: boolean,
 *   publicText: string, memberText: string,
 *   publicHeadings: string[], memberHeadings: string[]
 * }}
 */
function extractPage(html) {
  const source = String(html || "");
  const head = source.slice(0, source.search(/<body\b/i) > -1 ? source.search(/<body\b/i) : source.length);
  const title = cleanTitle(attr(head, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = attr(head, /<meta\s+name=["']description["']\s+content=(?:"([^"]*)"|'([^']*)')/i);
  const isRedirect = /<meta\s+http-equiv=["']refresh["']/i.test(head);

  const bodyStart = source.search(/<body\b/i);
  const body = (bodyStart > -1 ? source.slice(bodyStart) : source).replace(COMMENT_RE, " ").replace(RAW_TEXT_RE, " ");

  const stack = []; // { tag, skip, premium, heading }
  const buckets = { public: [], member: [] };
  const headings = { public: [], member: [] };
  let headingText = null; // text collected for the open h1-h3
  let hasGate = false;
  let cursor = 0;

  const state = () => {
    let skip = false;
    let premium = false;
    for (const el of stack) {
      if (el.skip) skip = true;
      if (el.premium) premium = true;
    }
    return { skip, premium };
  };
  // Whitespace is kept (squash collapses it later): a <br> or a block
  // boundary is a word boundary, and dropping it glues two words together.
  const take = (text) => {
    if (!text) return;
    const { skip, premium } = state();
    if (skip) return;
    buckets[premium ? "member" : "public"].push(text);
    if (headingText !== null) headingText.push(text);
  };

  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(body)) !== null) {
    take(body.slice(cursor, m.index));
    cursor = TAG_RE.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] || "";
    if (tag === "body" || tag === "html") continue;

    if (closing) {
      let at = -1;
      for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].tag === tag) { at = i; break; }
      if (at === -1) continue;
      const closed = stack.splice(at);
      if (closed.some((el) => el.heading) && headingText !== null) {
        const text = squash(headingText.join(" "));
        if (text) headings[state().premium || closed.some((el) => el.premium) ? "member" : "public"].push(text);
        headingText = null;
      }
      take(" ");
      continue;
    }

    if (VOID_TAGS.has(tag)) {
      take(" ");
      continue;
    }
    if (/\/\s*$/.test(attrs)) continue; // self-closed
    const premium = PREMIUM_ATTR_RE.test(attrs);
    if (premium) hasGate = true;
    const heading = /^h[1-3]$/.test(tag);
    const before = state();
    stack.push({ tag, skip: SKIPPED_TAGS.has(tag) || CHROME_CLASS_RE.test(attrs), premium, heading });
    if (heading && !before.skip && !state().skip) headingText = [];
    take(" ");
  }
  take(body.slice(cursor));

  return {
    title,
    description,
    isRedirect,
    hasGate,
    publicText: squash(buckets.public.join("")),
    memberText: squash(buckets.member.join("")),
    publicHeadings: headings.public,
    memberHeadings: headings.member,
  };
}

module.exports = { extractPage, decodeEntities, cleanTitle };
