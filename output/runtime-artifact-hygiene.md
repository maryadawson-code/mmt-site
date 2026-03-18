# Runtime Artifact Hygiene

In git: HTML, build.js, functions, migrations, js/css, data, logos, workflows, legal pages.
NOT in git: .env, node_modules, dist, *.mp4, *.zip, n8n-workflows, test-results.
Secrets: All in Netlify env vars (14 keys). Rotation: regenerate > env:set > redeploy > verify > revoke old.
