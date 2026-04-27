# Newsletter Source-of-Truth Gap (2026-04-27)

## Summary

Mary identified six recently published newsletter editions that should be on the site but are not:

1. **The DHP Is Gone. The Direct Care System Stayed.**
2. **The Laboratory: How Trump Is Dismantling the $26.2 Billion 8(a) Program and What Comes Next**
3. **The Capture Gap. And how I'm closing it.**
4. **The Direct Care System Outperforms. The FY2027 Budget Restructures It Anyway.**
5. **The Rule of Two No Longer Applies to IDIQ Task Orders. The Q3 Window Is Now.**
6. **The force multiplier is live.**

These editions exist on LinkedIn (and likely Buttondown). The article bodies are NOT accessible to Claude Code from any of:

- `~/Projects/` (only mmt-site/docs mention "Capture Gap" in non-article files)
- `~/Desktop/`
- `~/Downloads/`
- `~/Documents/`
- `~/Library/CloudStorage/Dropbox`, `GoogleDrive-mary@missionmeetstech.com`, `OneDrive-Personal` (cloud-mounted but not searched in this run; Claude Code doesn't have permission to walk them)

I am not claiming `/latest` is fixed for these articles. They are missing because the source content is missing.

## What needs to happen

Mary (or her Claude newsletter project) must hand over the article bodies. There are three viable paths, in order of preference:

### Path A — Use the publishing workflow that just shipped

For each missing edition, the Claude newsletter project produces one JSON payload conforming to `docs/newsletter-production-payload.schema.json`, with:

- `status: "production_approved"`
- `approval_phrase: "send_to_production"`
- `title`, `description`, `body_markdown`, `publish_date` (use the original LinkedIn publish date)
- `slug` (optional — derived from title if absent)
- `linkedin_url` (canonical reference)

Triggering the GitHub Actions workflow `Publish newsletter (production)` with each payload writes the markdown into `content/newsletter/`, runs build + tests, and either opens a PR or commits to main.

This is the canonical path going forward.

### Path B — One-time export from the Claude newsletter project

If the Claude newsletter project keeps draft files on disk (e.g. in a project folder, an export, or a synced cloud drive), Mary can drop them into `content/newsletter/` directly with frontmatter shaped like `content/newsletter/_template.md`. Build will pick them up automatically.

The folder Claude Code can see is anywhere under `~/Projects/`, `~/Desktop/`, or `~/Documents/`. If the Project files live somewhere else (e.g. `~/Library/Containers/com.anthropic.claude/`), Mary must copy them to a visible location first.

### Path C — Buttondown / LinkedIn export

Buttondown's API exposes archived issues at:

```
GET https://api.buttondown.email/v1/emails?status=sent&ordering=-publish_date&limit=20
Authorization: Token <BUTTONDOWN_API_KEY>
```

The API returns full body markdown. A short script (`scripts/import-from-buttondown.js` — not yet written) could pull the last N issues and write them as markdown. **Per Mary's directive: do not use LinkedIn as the primary source.** Buttondown is the next-best fallback if the Claude Project files are not accessible. Implementing this script is gated on Mary providing the API key in Netlify env, then explicit approval to run.

## What is NOT broken

To be precise about what `/latest` actually does today:

- `dist/latest.html` correctly includes every article in `content/newsletter/*.md`. The newest source article (April 15, 2026 — DoW CIO) IS on the page, both as an Editor's Pick tile at the top and (after this commit) at the top of the main archive list.
- `dist/newsletters.json` correctly merges the markdown source with the historical archive in root `newsletters.json`.
- `validate-routes.js` enforces that the newest valid markdown article appears in `dist/latest.html`.

The gap is not in the rendering pipeline. The gap is that `content/newsletter/` is missing six articles that exist on LinkedIn.

## Inventory

`reports/newsletter-inventory.json` (regenerated on every build) will list:

- newest markdown article in `content/newsletter/`
- newest article rendered in `dist/latest.html`
- explicit `missing` list for the six known-by-title articles, with reason `source_not_found`

Mary should treat the `missing` list as a content-import worklist. Each item resolves via Path A (preferred) or Path B (one-time backfill).

## What I will NOT do

- Scrape LinkedIn as a normal production workflow. (Per Mary's directive.)
- Create stub articles with placeholder bodies.
- Hardcode titles into `/latest` to make it look fresh.
- Claim `/latest` is fixed for these articles. It isn't, and won't be, until the source bodies arrive via one of the three paths above.

## Fix prerequisites

For Path A (the canonical newsletter workflow):

1. Mary's Claude Project knows the production prompt at `docs/claude-newsletter-agent-production-prompt.md`.
2. The GitHub Actions workflow at `.github/workflows/publish-newsletter-production.yml` has `secrets.GITHUB_TOKEN` (default-available) and Mary's account has `workflow_dispatch` permission on the repo.
3. Mary uses the exact phrase `send to production` in her Project. The Project assembles the payload, calls the workflow, and reports the PR URL back to Mary.

For Path B (one-time backfill):

1. Mary drops the six article markdown files into `content/newsletter/` with valid frontmatter (see `_template.md`).
2. Build picks them up automatically. No code change required.
