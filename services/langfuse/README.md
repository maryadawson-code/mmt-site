# Langfuse — Digital Mary Eval Observability

Self-hosted Langfuse instance for tracking every Digital Mary turn,
running the nightly LLM-as-judge eval (`eval/run-eval.js`), and
maintaining the baseline-vs-current scoreboard.

## Deploy (one-time, Fly.io)

```bash
cd services/langfuse
fly launch --no-deploy --name mmt-langfuse --region ord
fly secrets set NEXTAUTH_SECRET=$(openssl rand -base64 32) \
                SALT=$(openssl rand -base64 32) \
                ENCRYPTION_KEY=$(openssl rand -hex 32) \
                NEXTAUTH_URL=https://mmt-langfuse.fly.dev \
                DATABASE_URL=$SUPABASE_DB_URL_LANGFUSE
fly deploy
```

After first boot:
1. Visit `https://mmt-langfuse.fly.dev`.
2. Create user account, then create the `Digital Mary` project (if not auto-seeded).
3. Settings → API Keys → "New" → label `digital-mary-prod`. Copy public + secret keys.
4. Paste into Netlify env (for eval harness) and Fly secrets on each MCP server:
   - `LANGFUSE_PUBLIC_KEY`
   - `LANGFUSE_SECRET_KEY`
   - `LANGFUSE_HOST=https://mmt-langfuse.fly.dev`

## Local dev

```bash
docker compose up -d
# http://localhost:3000
```

## Cost

Fly tier ~$5/mo for the web app; Postgres lives in Supabase (free tier
sufficient for eval traffic at our volume).

## Verification

`curl https://mmt-langfuse.fly.dev/api/public/health` should return
`{"status":"ok"}`. The nightly GitHub Action posts results to this
instance via the API keys above.
