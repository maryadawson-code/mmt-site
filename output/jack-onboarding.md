# Jack's Access — Mission Meets Tech

## Command Center

**URL:** https://missionmeetstech.com/command-center.html
**Login:** Enter `jackyang2326@gmail.com` → magic link sent to your inbox
**Default workspace:** Development
**Your role:** CTO

### First login
1. Go to the URL above
2. Enter your email
3. Check inbox for magic link (arrives within 30 seconds)
4. Click the link — you're in

> **Note:** Mary needs to add your user record first. From the command center, click "Manage Users" → add `jackyang2326@gmail.com` with name `Jack Yang` and role `cto`. Or run this curl against the API with the COMMAND_CENTER_KEY.

## MissionPulse.ai

**URL:** https://missionpulse.ai
**Login:** Sign up or log in with `jackyang2326@gmail.com` via Supabase Auth
**Role:** Set to `admin` or `cto` in the `profiles` table after first login

## GitHub Repos

- https://github.com/maryadawson-code/mmt-site — MMT marketing site + command center
- https://github.com/maryadawson-code/missionpulse-frontend — MissionPulse SaaS app

> **Action needed:** Mary needs to add your GitHub username as a collaborator on both repos (Settings → Collaborators → Add people)

## What's live right now

### Command Center (mmt-site)
- **3 workspaces:** Development, Operations, Editorial
- Your Dev workspace has:
  - **Engineering:** Live Netlify deploy history, GitHub PRs, tech debt from roadmap
  - **Roadmap:** Full CRUD — create features, verify health, pre-flight checks, edit, comment
  - **Issues:** Full lifecycle — detect → diagnose → fix → approve → deploy → verify → close
  - **QA:** Product health grades, SLA metrics, regression management (file issues, link PRs, resolve)
  - **Agent Fleet:** Agent status cards with steering (pause/resume/cancel/escalate), quick dispatch, per-agent task stream
  - **Site Health:** Ops events, circuit breakers, feature flags, held emails
  - **Security:** CMMC L2 posture, open findings
  - **Cost Intelligence:** API costs, alerts, trends

### MissionPulse.ai (missionpulse-frontend)
- **Agent interaction layer** (spec 10O-10S):
  - AgentCards — live agent status dashboard (30s poll)
  - AgentConversationPanel — real-time task event stream (15s poll)
  - AgentSteering — pause/resume/cancel/escalate/reprioritize controls
  - ApprovalQueue — HITL safety gate with risk levels + diff previews
  - NaturalLanguageRouter — NL command bar for dispatching tasks to agents
- **Product Roadmap** — feature-level tracking with developer workspace (5 tabs: Overview, Code, AI Assistant, Tests & Health, Deploy)
- **6 agents seeded:** ops-code, ops-editorial, ops-research, ops-monitor, ops-social, ops-newsletter

## Quick start

1. Open Command Center → you'll land in the **Development** workspace
2. Check **Roadmap** for current features and status
3. Check **Issues** for anything in "Needs Attention"
4. **Agent Fleet** → dispatch tasks or steer running agents
5. **Engineering** → see recent deploys and open PRs
6. Press **Cmd+K** to search/navigate to any view across all workspaces

## Environment setup (for local dev)

```bash
# Clone repos
git clone git@github.com:maryadawson-code/mmt-site.git
git clone git@github.com:maryadawson-code/missionpulse-frontend.git

# mmt-site (static site + Netlify functions)
cd mmt-site
npm install
node build.js
netlify dev  # runs locally with functions

# missionpulse-frontend (Next.js)
cd missionpulse-frontend
npm install
npm run dev  # http://localhost:3000
```

Required env vars are in each repo's CLAUDE.md.
