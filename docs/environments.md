# Environments

## Production

- **Branch:** `main`
- **URL:** https://missionmeetstech.com
- **Deploy:** Automatic on push to `main`
- **Build command:** `node build.js`

## Staging

- **Branch:** `staging`
- **URL:** `staging--missionmeetstech.netlify.app` (auto-deployed by Netlify branch deploys)
- **Deploy:** Automatic on push to `staging`
- **Build command:** `node build.js`
- **netlify.toml config:** `[context.staging]` block

## Branch Deploys

Any branch pushed to origin gets a deploy preview at `{branch}--missionmeetstech.netlify.app`.
Configured via `[context.branch-deploy]` in netlify.toml.

## Setup

To create the staging branch:
```bash
git checkout -b staging
git push -u origin staging
```

Netlify will automatically detect the branch and deploy it.

## Environment Variables

All environments share the same Netlify env vars. Use `CONTEXT` env var
(automatically set by Netlify) to distinguish:
- `production` — main branch
- `branch-deploy` — any other branch
- `deploy-preview` — PR previews
