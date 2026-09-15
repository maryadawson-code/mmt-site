#!/usr/bin/env node
// Generates premium/dhits-2026.html from data/dhits-2026-slides.json.
//
// Each deck links to the original PDF where DHA posted it on the DHITS event
// site (Cvent). Nothing is rehosted. Summaries and key points were written
// from the extracted slide text only. Recording moments (data.recordings)
// are paraphrased from YouTube auto-captions and link to their timestamps.
// Edit the JSON, then run: node scripts/generate-dhits-slide-library.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'dhits-2026-slides.json');
const OUT = path.join(ROOT, 'premium', 'dhits-2026.html');
const CVENT_FILE = /^https:\/\/custom\.cvent\.com\/[0-9A-F]{32}\/files\/[0-9a-f]{32}\.pdf$/;

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’"]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const deckAnchor = (deck) => 'deck-' + deck.anchor;
const recAnchor = (rec) => 'rec-' + rec.video_id;
const mb = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const ytUrl = (id, t) => `https://www.youtube.com/watch?v=${id}` + (t ? `&t=${t}s` : '');
const clock = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};
const minutes = (sec) => `${Math.round(sec / 60)} min`;

// Overview highlights. Every figure here is printed in the linked deck or
// said at the linked recording timestamp.
const HIGHLIGHTS = [
  {
    lead: 'The budget is changing shape.',
    text: 'Michael Emerson\'s plenary lays out the FY27 split of the Defense Health Program into the Combat and Operational Medicine Program (COMP, a $40.9B request) and the Private Sector Care Program (PSCP). Information management is a $2.6B FY27 request.',
    decks: ['mr-michael-emersons-plenary'],
  },
  {
    lead: 'Identity is the perimeter now.',
    text: 'Pat Flanders opened with a $19M automated identity onboarding push, goal December 31, 2026, and the move from DSLOGON to MyAuth by October 2026. The ICAM deck names the stack: Ping Identity, SailPoint, Radiant Logic, and BeyondTrust.',
    decks: ['mr-pat-flanders-opening-plenary', 'identity-credential-and-access-management-icam-the-keystone-for'],
  },
  {
    lead: 'AI has numbers attached.',
    text: 'DHA reports 400+ AI use cases and 58,949 users, a 34.53% adoption rate across 170,738 health.mil addresses. Ask Sage launched December 8, 2025 and is authorized for CUI, PII, and PHI.',
    decks: ['building-the-foundations-for-responsible-ai-from-data-strategy', 'mr-pat-flanders-opening-plenary'],
  },
  {
    lead: 'A vehicle to know.',
    text: 'The Geographic Service Providers (GSP) IDIQ: $2.4B ceiling, 10 years, 33 contract holders, 100% small business set-aside.',
    decks: ['mr-pat-flanders-opening-plenary'],
  },
  {
    lead: 'Federal EHR, as of July 2026.',
    text: '138 of 138 parent military treatment facilities and 14 of 170 VA Medical Centers complete, with 223,000+ users and 8.8M+ unique patients in the record.',
    decks: ['technical-governance-and-infrastructure-operating-the-federal-ehr'],
  },
  {
    lead: 'Acquisition is getting rebuilt.',
    text: 'The Transforming Medical Acquisition panel walks through AD-RDA\'s five acquisition transformation pillars. The FAR overhaul deck covers the Revolutionary FAR Overhaul, whose Phase 1 finished February 1, 2026.',
    decks: ['transforming-medical-acquisition-plenary-panel', 'revolutionary-federal-acquisition-regulation-far-overhaul'],
  },
  {
    lead: 'Faster buying, with live tests.',
    text: 'VADM Via said more CSOs and OTAs are coming. The first PARATUS area of interest covers the periodic health exam, and offerors must pass live tests in DHA environments. DHA also has a new enterprise-wide CSO for rapid OTA and FAR awards, and its acquisition leaders said plainly that industry cannot yet see what DHA will buy next year.',
    recs: [['hGbZ2GRhPs8', 872], ['BMpHatGQ-so', 1629], ['bAwhD-vh6nM', 3998]],
  },
  {
    lead: 'The data plan has a shape.',
    text: 'Flanders said DHA will not build its own data orchestration layer. General-purpose data goes through the War Data Platform, and operational data flows through JOMIS into Maven for the combatant commands.',
    recs: [['dLly3ZY6cu8', 1330]],
  },
  {
    lead: 'Dates they said out loud.',
    text: 'ICAM done by December 31. CrowdStrike fully deployed by December. MTF CIO billets at GS-13 by October 1. The campaign order, with metrics for the lines of effort, expected in October.',
    recs: [['dLly3ZY6cu8', 840], ['pOu5_cZAXQ4', 646], ['dLly3ZY6cu8', 1133], ['xVdsBU3K4qE', 1856]],
  },
];

function main() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const { event, tracks } = data;
  const recordings = data.recordings || [];

  const sessions = tracks.flatMap((t) => t.sessions);
  const decks = sessions.filter((s) => s.deck);
  const deckCount = decks.length;
  const pageCount = decks.reduce((n, s) => n + s.deck.pages, 0);
  const recMinutes = Math.round(recordings.reduce((n, r) => n + r.duration, 0) / 60);

  // Every deck link must be a Cvent file URL, every recording a YouTube id
  // with in-range timestamps, and every highlight must point at a real deck
  // or recording moment.
  const byBase = new Map(decks.map((s) => [s.deck.anchor, s]));
  const byVideo = new Map(recordings.map((r) => [r.video_id, r]));
  for (const s of decks) {
    if (!CVENT_FILE.test(s.deck.url)) throw new Error(`deck link is not a Cvent file URL for "${s.title}": ${s.deck.url}`);
  }
  for (const r of recordings) {
    if (!YT_ID.test(r.video_id)) throw new Error(`bad YouTube id: ${r.video_id}`);
    for (const a of r.deck_anchors) if (!byBase.has(a)) throw new Error(`recording ${r.video_id} points at unknown deck: ${a}`);
    for (const m of r.moments) if (m.t < 0 || m.t >= r.duration) throw new Error(`recording ${r.video_id} moment out of range: ${m.t}`);
  }
  for (const h of HIGHLIGHTS) {
    for (const d of h.decks || []) if (!byBase.has(d)) throw new Error(`highlight points at unknown deck: ${d}`);
    for (const [id, t] of h.recs || []) {
      const r = byVideo.get(id);
      if (!r || !r.moments.some((m) => m.t === t)) throw new Error(`highlight points at unknown recording moment: ${id}@${t}`);
    }
  }

  // Deck anchor -> recording of that same talk, or a related one.
  const recForDeck = new Map();
  for (const r of recordings) for (const a of r.deck_anchors) recForDeck.set(a, r);

  const tsLink = (r, t) => `<a class="ds-ts" href="${esc(ytUrl(r.video_id, t))}" target="_blank" rel="noopener">${clock(t)}</a>`;

  const highlightHtml = HIGHLIGHTS.map((h) => {
    const deckLinks = (h.decks || []).map((d) => {
      const s = byBase.get(d);
      return `<a href="#${deckAnchor(s.deck)}">${esc(s.title)}</a>`;
    });
    const recLinks = (h.recs || []).map(([id, t]) => {
      const r = byVideo.get(id);
      return `<a href="${esc(ytUrl(id, t))}" target="_blank" rel="noopener">${esc(r.title)} at ${clock(t)}</a>`;
    });
    return `        <li><strong>${esc(h.lead)}</strong> ${esc(h.text)} <span class="ds-hl-src">${[...deckLinks, ...recLinks].join(' &middot; ')}</span></li>`;
  }).join('\n');

  const chipHtml = [
    recordings.length ? `      <a class="ds-chip" href="#recordings">Plenary recordings</a>` : '',
    ...tracks.map((t) => `      <a class="ds-chip" href="#track-${slug(t.name)}">${esc(t.name.split(':')[0])}</a>`),
  ].filter(Boolean).join('\n');

  const recordingHtml = (r) => {
    const moments = r.moments.map((m) => `          <li>${tsLink(r, m.t)} ${esc(m.point)}</li>`).join('\n');
    const decksFor = r.deck_anchors.map((a) => byBase.get(a));
    const slides = decksFor.length
      ? `\n          <span class="ds-size">${r.deck_relation === 'related' ? 'Related slides' : 'Slides'}: ${decksFor.map((s) => `<a href="#${deckAnchor(s.deck)}">${esc(s.title)}</a>`).join(' &middot; ')}</span>`
      : '';
    const speaker = r.speaker_note ? `\n        <p class="ds-presenters">${esc(r.speaker_note)}</p>` : '';
    const search = [r.title, r.speaker_note || '', r.summary, ...r.moments.map((m) => m.point), 'recording video'].join(' ').toLowerCase();
    return `      <article class="ds-deck ds-rec" id="${recAnchor(r)}" data-search="${esc(search)}">
        <p class="ds-block">Recording &middot; ${minutes(r.duration)}</p>
        <h3>${esc(r.title)}</h3>${speaker}
        <p class="ds-summary">${esc(r.summary)}</p>
        <p class="ds-moments-h">Key moments</p>
        <ul class="ds-points ds-moments">
${moments}
        </ul>
        <div class="ds-actions">
          <a class="ds-open" href="${esc(ytUrl(r.video_id))}" target="_blank" rel="noopener">Watch on YouTube</a>${slides}
        </div>
      </article>`;
  };

  const recordingsSection = recordings.length ? `    <section class="ds-track" id="recordings">
      <h2>Plenary recordings</h2>
      <p class="ds-track-meta">${recordings.length} recordings &middot; about ${Math.round(recMinutes / 60)} hours on YouTube</p>
      <p class="ds-track-note">DHA posted recordings of the plenary sessions, including four that have no slides at all. Key moments are paraphrased from YouTube's auto-generated captions. Click a timestamp to hear it in the speaker's own words.</p>
${recordings.map(recordingHtml).join('\n')}
    </section>

` : '';

  const sessionHtml = (t, s) => {
    const label = s.block ? `Block ${s.block}` : 'Plenary';
    if (!s.deck) {
      return `      <article class="ds-deck ds-deck-missing" data-search="${esc((s.title + ' ' + t.name).toLowerCase())}">
        <p class="ds-block">${label} &middot; ${esc(t.room)}</p>
        <h3>${esc(s.title)}</h3>
        <p class="ds-summary">DHA did not post a deck for this session on the DHITS site.</p>
      </article>`;
    }
    const d = s.deck;
    const presenters = s.presenters.length
      ? `\n        <p class="ds-presenters">${s.presenters.map(esc).join('<br>')}</p>` : '';
    const points = s.key_points.map((k) => `          <li>${esc(k)}</li>`).join('\n');
    const rec = recForDeck.get(d.anchor);
    let onStage = '';
    const featured = rec && rec.deck_relation === 'same' ? rec.moments.filter((m) => m.featured) : [];
    if (featured.length) {
      onStage = `
        <div class="ds-onstage">
          <p class="ds-moments-h">From the recording</p>
          <ul class="ds-points ds-moments">
${featured.map((m) => `            <li>${tsLink(rec, m.t)} ${esc(m.point)}</li>`).join('\n')}
          </ul>
          <p class="ds-onstage-more"><a href="#${recAnchor(rec)}">All ${rec.moments.length} key moments</a> &middot; <a href="${esc(ytUrl(rec.video_id))}" target="_blank" rel="noopener">Watch the talk (${minutes(rec.duration)})</a></p>
        </div>`;
    } else if (rec) {
      onStage = `
        <p class="ds-onstage-more">Related plenary recording: <a href="#${recAnchor(rec)}">${esc(rec.title)}</a></p>`;
    }
    const search = [s.title, t.name, ...s.presenters, s.summary, ...s.key_points, ...featured.map((m) => m.point)].join(' ').toLowerCase();
    return `      <article class="ds-deck" id="${deckAnchor(d)}" data-search="${esc(search)}">
        <p class="ds-block">${label} &middot; ${esc(t.room)}</p>
        <h3>${esc(s.title)}</h3>${presenters}
        <p class="ds-summary">${esc(s.summary)}</p>
        <ul class="ds-points">
${points}
        </ul>${onStage}
        <div class="ds-actions">
          <a class="ds-open" href="${esc(d.url)}" target="_blank" rel="noopener">Open the deck</a>
          <span class="ds-size">PDF on the DHITS site &middot; ${d.pages} slides &middot; ${mb(d.bytes)}</span>
        </div>
      </article>`;
  };

  const trackHtml = tracks.map((t) => {
    const n = t.sessions.filter((s) => s.deck).length;
    return `    <section class="ds-track" id="track-${slug(t.name)}">
      <h2>${esc(t.name)}</h2>
      <p class="ds-track-meta">${esc(t.room)} &middot; ${n} ${n === 1 ? 'deck' : 'decks'}</p>
      <p class="ds-track-note">${esc(t.note)}</p>
${t.sessions.map((s) => sessionHtml(t, s)).join('\n')}
    </section>`;
  }).join('\n\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DHITS 2026 Slide Library | MMT Premium</title>
  <meta name="robots" content="noindex">
  <meta name="description" content="All ${deckCount} slide decks DHA posted from the 2026 Defense Health Information Technology Symposium, organized by track, with a short summary of each${recordings.length ? `, plus key moments from the ${recordings.length} plenary recordings` : ''}.">
  <link rel="stylesheet" href="/styles/tailwind.css">
  <link rel="icon" href="/favicon-v3.png" type="image/png">
  <style>
    /* Content styles only. The layout shell is injected at build time by
       build.js injectDashShell(). Generated by
       scripts/generate-dhits-slide-library.js; edit the JSON, not this file. */
    :root { --mmt-navy:#0A192F; --mmt-teal:#457B9D; --mmt-white:#FFFFFF; --mmt-surface:#F3F4F6; --mmt-text-secondary:#6B7280; --mmt-border:#E5E7EB; }
    .dash-card { background:var(--mmt-white); border-radius:12px; padding:24px; margin-bottom:16px; border:1px solid var(--mmt-border); }
    .dash-content-header { display:flex; align-items:center; justify-content:space-between; gap:12px 16px; flex-wrap:wrap; margin-bottom:24px; }
    .dash-content-header .dch-title { font-size:14px; font-weight:700; }
    .ds-wrap { max-width:920px; }
    .ds-eyebrow { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--mmt-text-secondary); margin:0 0 8px; }
    .ds-meta { font-size:14px; color:var(--mmt-text-secondary); margin:0 0 20px; }
    .ds-overview p { font-size:15px; line-height:1.65; margin:0 0 12px; max-width:68ch; }
    .ds-overview h2 { font-size:17px; font-weight:800; margin:18px 0 10px; }
    .ds-overview ul { margin:0; padding-left:20px; list-style:disc; }
    .ds-overview li { font-size:14px; line-height:1.6; margin-bottom:10px; }
    .ds-hl-src { display:block; font-size:12px; margin-top:2px; }
    .ds-hl-src a, .ds-track-note a { color:var(--mmt-teal); text-decoration:none; font-weight:600; }
    .ds-hl-src a:hover { text-decoration:underline; }
    .ds-tools { position:sticky; top:0; z-index:5; background:var(--mmt-surface); padding:12px 0; margin-bottom:8px; }
    .ds-search { width:100%; font-size:15px; padding:10px 14px; border:1px solid var(--mmt-border); border-radius:8px; background:var(--mmt-white); color:var(--mmt-navy); box-sizing:border-box; }
    .ds-search:focus { outline:2px solid var(--mmt-teal); outline-offset:1px; }
    .ds-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
    .ds-chip { font-size:12px; font-weight:600; padding:4px 10px; border-radius:14px; border:1px solid var(--mmt-border); background:var(--mmt-white); color:var(--mmt-teal); text-decoration:none; }
    .ds-chip:hover { border-color:var(--mmt-teal); }
    .ds-count { font-size:12px; color:var(--mmt-text-secondary); margin:8px 0 0; }
    .ds-track { margin:28px 0 8px; scroll-margin-top:140px; }
    .ds-track h2 { font-size:20px; font-weight:800; margin:0 0 2px; }
    .ds-track-meta { font-size:12px; font-weight:600; color:var(--mmt-text-secondary); margin:0 0 6px; }
    .ds-track-note { font-size:14px; line-height:1.6; margin:0 0 14px; max-width:68ch; }
    .ds-deck { background:var(--mmt-white); border:1px solid var(--mmt-border); border-left:3px solid var(--mmt-teal); border-radius:0 12px 12px 0; padding:18px 22px; margin-bottom:12px; scroll-margin-top:140px; }
    .ds-deck:target { box-shadow:0 0 0 2px var(--mmt-teal); }
    .ds-deck-missing { border-left-color:var(--mmt-border); }
    .ds-block { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--mmt-text-secondary); margin:0 0 4px; }
    .ds-deck h3 { font-size:16px; font-weight:700; line-height:1.4; margin:0 0 6px; }
    .ds-presenters { font-size:12px; line-height:1.5; color:var(--mmt-text-secondary); margin:0 0 8px; }
    .ds-summary { font-size:14px; line-height:1.6; margin:0 0 8px; }
    .ds-points { margin:0 0 12px; padding-left:18px; list-style:disc; }
    .ds-points li { font-size:13px; line-height:1.55; margin-bottom:3px; }
    .ds-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; }
    .ds-open { display:inline-block; background:var(--mmt-navy); color:#FFFFFF !important; font-weight:700; font-size:13px; padding:8px 16px; border-radius:8px; text-decoration:none; }
    .ds-open:hover { background:var(--mmt-teal); }
    .ds-size { font-size:12px; color:var(--mmt-text-secondary); }
    .ds-rec { border-left-color:var(--mmt-navy); }
    .ds-moments-h { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--mmt-text-secondary); margin:10px 0 6px; }
    .ds-moments { list-style:none !important; padding-left:0; }
    .ds-moments li { display:flex; gap:10px; align-items:baseline; margin-bottom:6px; }
    .ds-ts { flex:0 0 auto; min-width:52px; text-align:center; font-size:12px; font-weight:700; font-variant-numeric:tabular-nums; color:var(--mmt-teal); background:rgba(69,123,157,0.1); border-radius:6px; padding:2px 6px; text-decoration:none; }
    .ds-ts:hover { background:var(--mmt-teal); color:#FFFFFF; }
    .ds-onstage { background:var(--mmt-surface); border-radius:8px; padding:4px 14px 10px; margin:0 0 12px; }
    .ds-onstage-more { font-size:12px; margin:4px 0 12px; }
    .ds-onstage-more a, .ds-size a { color:var(--mmt-teal); font-weight:600; text-decoration:none; }
    .ds-onstage-more a:hover, .ds-size a:hover { text-decoration:underline; }
    .ds-empty { font-size:14px; color:var(--mmt-text-secondary); padding:16px 0; }
    .ds-source { font-size:12px; line-height:1.6; color:var(--mmt-text-secondary); margin:24px 0 0; }
    .ds-source a { color:var(--mmt-teal); }
    @media (max-width:768px) { .ds-deck { padding:16px; } .ds-open, .ds-chip { min-height:44px; display:inline-flex; align-items:center; } }
  </style>
  <script>
    (function() {
      var isPremium = localStorage.getItem('mmt_premium') === 'true';
      var ts = localStorage.getItem('mmt_premium_ts');
      var withinWindow = ts && (Date.now() - parseInt(ts)) < 30 * 24 * 60 * 60 * 1000;
      if (!isPremium || !withinWindow) {
        window.location.href = '/dashboard.html?next=' + encodeURIComponent(window.location.pathname);
      }
    })();
  </script>
</head>
<body>
  <nav class="nav-editorial"></nav>

  <div class="dash-content-header">
    <span class="dch-title">&#9733; DHITS 2026 Slide Library</span>
    <a href="/premium/dashboard/" style="font-size:12px; color:var(--mmt-teal); text-decoration:none;">Back to dashboard</a>
  </div>

  <div class="ds-wrap">
    <p class="ds-eyebrow">MMT Premium &middot; Conference slides</p>
    <h1 style="font-size:clamp(24px,3vw,32px);line-height:1.15;letter-spacing:-0.02em;margin:0 0 6px;color:var(--mmt-navy);">DHITS 2026: every slide deck, summarized</h1>
    <p class="ds-meta">${esc(event.sponsor)} &middot; ${esc(event.dates)} &middot; ${esc(event.venue)} &middot; ${deckCount} decks &middot; ${pageCount.toLocaleString('en-US')} slides${recordings.length ? ` &middot; ${recordings.length} plenary recordings` : ''}</p>

    <div class="dash-card ds-overview">
      <p>DHA ran the 2026 Defense Health Information Technology Symposium ${esc(event.dates.replace(/-/, ' to ').replace(', 2026', ''))} at the ${esc(event.venue)}. The theme was &ldquo;${esc(event.theme)}.&rdquo; After the show, DHA posted ${deckCount} slide decks on the event site: four plenaries and eight breakout tracks, ${pageCount.toLocaleString('en-US')} slides in all.${recordings.length ? ` It also posted ${recordings.length} plenary recordings, about ${Math.round(recMinutes / 60)} hours of leaders talking and taking questions.` : ''}</p>
      <p>I pulled every deck into one place. Each one below has a short summary and the specifics worth knowing, so you can find the three decks that matter to your pursuit without opening all ${deckCount}. Every link opens the original deck right where DHA posted it.${recordings.length ? ` The recordings are where leaders said what the slides leave out, so each one has its key moments with timestamps that jump straight to that part of the video.` : ''}</p>
      <h2>What stood out</h2>
      <ul>
${highlightHtml}
      </ul>
    </div>

    <div class="ds-tools">
      <label for="ds-q" class="sr-only" style="position:absolute;left:-9999px;">Search the decks</label>
      <input id="ds-q" class="ds-search" type="search" placeholder="Search titles, presenters, and summaries (try: zero trust, JOMIS, MED365)" autocomplete="off">
      <div class="ds-chips">
${chipHtml}
      </div>
      <p class="ds-count" id="ds-count" aria-live="polite">Showing all ${deckCount} decks${recordings.length ? ` and ${recordings.length} recordings` : ''}</p>
    </div>

${recordingsSection}${trackHtml}

    <p class="ds-empty" id="ds-empty" hidden>Nothing matches that search.</p>

    <p class="ds-source">Slides: DHA's <a href="${esc(event.slides_page_url)}" target="_blank" rel="noopener">DHITS 2026 presentation slides page</a>, checked ${esc(event.retrieved)}.${recordings.length ? ` Recordings: DHA's <a href="${esc(event.recordings_page_url)}" target="_blank" rel="noopener">DHITS 2026 plenary recordings page</a>, hosted on YouTube.` : ''} Event details: the <a href="${esc(event.event_url)}" target="_blank" rel="noopener">DHITS 2026 event site</a>. Deck summaries are written from the slide text only, and recording moments are paraphrased from auto-generated captions. Open the deck or follow the timestamp for full context.</p>
  </div>

  <script>
    (function () {
      var q = document.getElementById('ds-q');
      var count = document.getElementById('ds-count');
      var empty = document.getElementById('ds-empty');
      var decks = Array.prototype.slice.call(document.querySelectorAll('.ds-deck'));
      var tracks = Array.prototype.slice.call(document.querySelectorAll('.ds-track'));
      var total = ${deckCount}, totalRecs = ${recordings.length};
      var label = function (n, of, noun) { return n + ' of ' + of + ' ' + noun; };
      q.addEventListener('input', function () {
        var terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
        var shown = 0, shownRecs = 0;
        decks.forEach(function (el) {
          var hay = el.getAttribute('data-search');
          var match = terms.every(function (t) { return hay.indexOf(t) !== -1; });
          el.hidden = !match;
          if (!match || el.classList.contains('ds-deck-missing')) return;
          if (el.classList.contains('ds-rec')) shownRecs++; else shown++;
        });
        tracks.forEach(function (t) { t.hidden = !t.querySelector('.ds-deck:not([hidden])'); });
        empty.hidden = shown + shownRecs > 0 || terms.length === 0;
        count.textContent = terms.length
          ? 'Showing ' + label(shown, total, 'decks') + (totalRecs ? ' and ' + label(shownRecs, totalRecs, 'recordings') : '')
          : 'Showing all ' + total + ' decks' + (totalRecs ? ' and ' + totalRecs + ' recordings' : '');
      });
    })();
  </script>
</body>
</html>
`;

  fs.writeFileSync(OUT, html);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${tracks.length} tracks, ${deckCount} decks, ${pageCount} slides`);
}

main();
