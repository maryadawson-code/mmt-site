# LaunchAgent Environment Variables Audit — 2026-03-20

## File: `~/Library/LaunchAgents/ai.openclaw.gateway.plist`

### Keys Present in Plist

| Key | Purpose | Status |
|-----|---------|--------|
| `HOME` | Home directory | System |
| `TMPDIR` | Temp directory | System |
| `NODE_EXTRA_CA_CERTS` | SSL certificates | System |
| `NODE_USE_SYSTEM_CA` | SSL config | System |
| `PATH` | Executable search path | System |
| `OPENCLAW_GATEWAY_PORT` | Gateway port (18789) | Config |
| `OPENCLAW_LAUNCHD_LABEL` | Service label | Config |
| `OPENCLAW_SYSTEMD_UNIT` | Systemd unit name | Config |
| `OPENCLAW_WINDOWS_TASK_NAME` | Windows task name | Config |
| `OPENCLAW_SERVICE_MARKER` | Service marker | Config |
| `OPENCLAW_SERVICE_KIND` | Service kind | Config |
| `OPENCLAW_SERVICE_VERSION` | Version (2026.3.13) | Config |
| `MMT_BRIDGE_KEY` | Agent bridge auth token | API Key |
| `TELEGRAM_BOT_TOKEN` | Telegram notifications | API Key |
| `ANTHROPIC_API_KEY` | Claude AI provider | API Key |
| `PERPLEXITY_API_KEY` | Perplexity research | API Key |
| `OPENAI_API_KEY` | OpenAI provider | API Key |
| `GOOGLE_AI_API_KEY` | Google AI provider | API Key |

### Assessment

**BRAVE_API_KEY:** NOT in plist, and NOT referenced anywhere in mmt-site codebase.
The site uses Anthropic `web_search` tool (opportunity-radar) and Perplexity API
(contract-intel-refresh). Neither uses Brave Search.

**PERPLEXITY_API_KEY:** Already present in plist. Used by `contract-intel-refresh-background.js`.
Also needs to be set in the **Netlify dashboard** (Functions scope) for deployed functions.

**Important:** The plist controls the local OpenClaw gateway process. Netlify Functions
get their env vars from the Netlify dashboard, not from the plist. Verify these are set
in Netlify: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`,
`PERPLEXITY_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`.

### Conclusion

No missing keys in the plist for the gateway's needs. If MarketPulse orders are failing,
check the Netlify dashboard env vars (Functions scope), not the local plist.
