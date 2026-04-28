# May 1, 2026 Release Runbook

Three artifacts are staged in this repo for the Friday May 1, 2026 release. The newsletter article auto-publishes via future-date gating in build.js. The tracker update and premium capture sheet require Mary's action.

## Schedule (anchored on 09:00 ET LinkedIn newsletter)

| Time (ET) | Action | Artifact | Owner |
|---|---|---|---|
| 06:00 | Email Premium Capture Sheet to subscribers | `data/may-1-release/premium-capture-sheet.md` | Mary (manual; email or gated web) |
| **09:00** | **LinkedIn newsletter publishes** (anchor) | LinkedIn native | **Mary (Taplio scheduling)** |
| 09:00–11:00 | Site article goes live automatically | `content/newsletter/2026-05-01-the-architecture-va-asks-for.md` | Auto (next Netlify rebuild after midnight UTC May 1) |
| 09:15 | Personal LinkedIn teaser post | LinkedIn personal feed | Mary (manual) |
| 12:00 | Contracts tracker update deploys | `data/may-1-release/contracts-tracker-update.md` | Mary or agent (commit content into `/contract-tracker` or paste into `/resources`) |
| 16:00 | newsletters.json refresh | Auto via build | Auto (Netlify cron rebuild every 4 hours picks up the May 1 article) |

## How "automatic release" actually works

`build.js` `loadArticles()` filters out any article whose `publish_date` is in the future relative to the build time. Once the wall clock crosses 2026-05-01 00:00 (local server time), the article is included on the next build. The `rebuild-trigger` Netlify scheduled function runs every 4 hours, so the article appears on missionmeetstech.com no later than 04:00 ET on May 1.

To pull it in earlier on May 1 (e.g. exactly at 09:00 ET to match the LinkedIn anchor), Mary or any agent can:

```bash
# Force a Netlify build at 09:00 ET on May 1
curl -X POST -d '{}' "$NETLIFY_BUILD_HOOK_URL"
```

Or push any commit on May 1 to trigger a build.

## Staged files

- `content/newsletter/2026-05-01-the-architecture-va-asks-for.md` — the public newsletter, frontmatter complete, future-date-gated. Will auto-publish on May 1.
- `data/may-1-release/premium-capture-sheet.md` — the Premium Capture Intelligence Sheet (VA Enterprise Imaging). Source for the 06:00 ET email blast. Not deployed to the public site.
- `data/may-1-release/contracts-tracker-update.md` — the May 2026 Contracts Tracker update. Twelve VA Enterprise Imaging tracker entries. Mary integrates into `contracts.json` or pastes into `/contract-tracker.html` on May 1 at 12:00 ET.

## Pre-flight (Thursday April 30 EOD)

- [ ] All three files reviewed and final
- [ ] Future-date gate verified: `node build.js` → output mentions "HOLDING (future-dated): 2026-05-01-the-architecture-va-asks-for.md"
- [ ] LinkedIn newsletter scheduled in Taplio for 09:00 ET May 1
- [ ] Premium subscriber list export ready for 06:00 ET email
- [ ] No competing major announcements Friday morning (VA SAM.gov, DHA news, GE HealthCare investor calendar)

## Publish-day verification (Friday May 1, 09:30 ET)

```bash
# Confirm the article is on the live site
curl -Ls https://missionmeetstech.com/latest | grep -E "Architecture VA Asks" | head -3

# Confirm the article page renders
curl -Ls https://missionmeetstech.com/newsletter/the-architecture-va-asks-for/ | grep -oE "<title>[^<]+" | head -1

# Confirm sitemap has it
curl -Ls https://missionmeetstech.com/sitemap.xml | grep -E "the-architecture-va-asks-for"

# Confirm deploy-id
curl -Ls https://missionmeetstech.com/deploy-id.txt | head -3
```

## Rollback

If a substantive error surfaces post-publish:

1. **Premium sheet error:** send corrected version to subscriber list within 4 hours with subject `[CORRECTION] Capture Intelligence Sheet — [field corrected]`.
2. **Newsletter error:** edit `content/newsletter/2026-05-01-the-architecture-va-asks-for.md` directly, push, deploy. Add an italic editor's note at the bottom: `[Updated May 1, 2026, HH:MM ET to correct (specific item).]`
3. **Tracker error:** push GitHub commit and trigger Netlify redeploy.

Standing rule: a correction issued within hours preserves credibility. A silent edit destroys it.
