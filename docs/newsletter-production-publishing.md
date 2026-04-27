# Newsletter Production Publishing

End-to-end runbook for the "send to production" workflow.

## The two phrases

- **`send to production`** — Mary says this in her Claude Project. The Project converts the issue to a payload, validates, and dispatches the GitHub Actions workflow. This writes the article markdown, runs build + tests, and either opens a PR (default) or commits to main (only with explicit acknowledgement).
- **`send email newsletter`** — separate, manual. The publishing workflow does NOT send email. Email goes via the existing `newsletter-send` cron / Buttondown path, triggered only when Mary says this phrase.

## File map

| Concern | Path |
|---|---|
| Schema | `docs/newsletter-production-payload.schema.json` |
| Publisher script | `scripts/publish-newsletter.js` |
| Post-publish smoke | `scripts/post-publish-smoke.js` |
| GitHub Actions workflow | `.github/workflows/publish-newsletter-production.yml` |
| Claude Project prompt | `docs/claude-newsletter-agent-production-prompt.md` |
| Newsletter source dir | `content/newsletter/*.md` |
| Reference frontmatter template | `content/newsletter/_template.md` |

## How a publish actually happens

1. Mary writes/refines an issue in her Claude Project. The Project holds.
2. Mary says **`send to production`**.
3. The Project assembles a JSON payload conforming to `docs/newsletter-production-payload.schema.json` with `status=production_approved` and `approval_phrase=send_to_production`.
4. The Project dispatches the **`Publish newsletter (production)`** GitHub Actions workflow with the payload as the `payload` input.
5. The workflow:
   1. Validates the payload (`scripts/publish-newsletter.js --dry-run`).
   2. Writes the markdown file to `content/newsletter/YYYY-MM-DD-slug.md`.
   3. Runs `node build.js`, `validate-dist`, `validate-routes`, and `vitest run tests/unit`.
   4. Either opens a PR (default) or commits straight to main (only when payload `publish_mode=direct_to_main` AND `direct_to_main_acknowledgement="I authorize direct main publish for this issue"`).
   5. Runs `scripts/post-publish-smoke.js` to confirm the article reached `/latest`, `/sitemap.xml`, `/newsletter/<slug>/`.

## Hard rules

- The publisher script will **refuse** to write a markdown file unless `--production-approved` is passed AND `status=production_approved` AND `approval_phrase=send_to_production`.
- Duplicate slug → fail.
- Duplicate `issue_number` → fail.
- `body_markdown` containing `---` (frontmatter delimiter) → fail.
- `send_email: true` in payload is **ignored**. Email is a separate workflow.
- Direct-to-main publish requires the exact acknowledgement string — otherwise the workflow opens a PR.

## Local dry-run

Mary or any collaborator can sanity-check a payload without mutating anything:

```bash
node scripts/publish-newsletter.js --input ./payload.json --dry-run
```

This validates the payload and prints what would be written.

## Producing the article — manual fallback

If the Claude Project workflow is unavailable, Mary or any agent can produce the article locally:

```bash
node scripts/publish-newsletter.js --input ./payload.json --production-approved
node build.js
node scripts/validate-routes.js
node scripts/post-publish-smoke.js --payload ./payload.json
git add content/newsletter/
git commit -m "newsletter: <YYYY-MM-DD> <slug>"
git push origin main
```

This is equivalent to the workflow's `direct_to_main` mode.

## Email

Email is **never** sent by this workflow. The existing newsletter-send Netlify function handles delivery; it runs on a cron and reads from Buttondown. To send the latest issue manually after a successful publish, Mary types **`send email newsletter`** which triggers the separate email workflow (currently a manual netlify function invocation — see `docs/deploy-handoff.md` for the exact command).

## Rollback

If a published article needs to be retracted:

```bash
git revert <commit-sha>
git push origin main
```

Netlify auto-redeploys. Then notify the Claude Project so it doesn't re-attempt to publish the same issue.
