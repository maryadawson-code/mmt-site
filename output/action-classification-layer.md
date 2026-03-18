# Action Classification Layer

Every AI task = one of five classes: READ, ANALYZE, PROPOSE, PATCH, EXECUTE.

## READ (Blast Radius: 1/5)
Query data, fetch pages, check status. No state changes.
Approval: None. Who: Any agent.

## ANALYZE (Blast Radius: 2/5)
Score proposals, generate intelligence, research. Writes to staging tables only.
Approval: None for scheduled. Mary for >$5 API cost. Who: Perplexity, Claude Code, Automated.

## PROPOSE (Blast Radius: 2/5)
Draft content, suggest changes, generate diffs. Nothing published.
Approval: None to create. Mary to promote. Who: Editorial, Claude Code.

## PATCH (Blast Radius: 3/5)
Modify files, update records, stage changes. Not yet live.
Approval: Mary for build.js, netlify.toml, security-headers.js, CSP, RLS, env vars. Who: Claude Code only.

## EXECUTE (Blast Radius: 4-5/5)
Deploy, push to main, run migrations, send emails, process payments.
Approval: Mary. No exceptions. Who: Claude Code with Mary approval.

## Workflow Map
| Workflow | Class |
|---|---|
| ProposalPulse scoring | ANALYZE |
| Tactical Brief generation | ANALYZE |
| Contract intel refresh | ANALYZE |
| Email delivery | EXECUTE |
| Netlify deploys | EXECUTE |
| Git push to main | EXECUTE |
| Content drafting | PROPOSE |
| Site QA | READ |
