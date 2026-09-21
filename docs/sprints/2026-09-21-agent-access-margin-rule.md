# Sprint 2026-09-21: Agent Access makes money, it never loses it

Trigger: Mary, after the overage billing shipped (#223): "Build the cap and
whatever else needed to ensure that I dont spend more than I'm making on this,"
then "the intent is for me to make money not lose it." Authoritative
description: `docs/agent-platform-spec.md` section 2.6.

## Looked before building

Read-only against production. A billing cap by itself would have made things
worse: stop billing at a limit, keep serving, and every call past it is cost
with no revenue. So the question was where Agent Access can actually lose money.

- Compute is not it. No agent endpoint ever recorded a cost (`cost_usd` is 0 on
  every audit row, so the $5-a-day budget gate could never trip). Only Ask MMT
  calls a model, about $0.007 a turn on the 25 turns on record, under the
  member's own monthly cap. The other three engines call no model.
- Today nothing is at stake: 0 paid seats, 0 Institutional members, 0 agent
  calls in a week, scoring batch idle.
- The leaks were on the revenue side: overage served to members nobody can
  bill (comped seats, Institutional), an unbounded bill, and a scoring ceiling
  ($60 a month) above the first seat's price ($39).

## Built

- `lib/agent-allowance-gate.js`, enforced in `authenticateAgent`: a billable
  agent runs to allowance plus limit (5,000 + 5,000 calls, so at most $50 of
  overage), then `429 OVERAGE_LIMIT_REACHED` until the next month. An agent
  nobody can bill gets `429 ALLOWANCE_REACHED` at the allowance. An agent in
  `overage_limit_overrides` runs to Mary's number.
- One count for the gate, the statement and the bill (audit rows, status below
  400). `summarizeRows` never prices a call past the limit.
- Billable read from Stripe only past the allowance, cached; a pending metered
  item counts as billable for an hour at a time; Stripe down serves the call.
- Pause emails to the member and to Mary, once per agent and month, from
  Mary's real address. The member copy no longer says "nothing is cut off".
- Pricing card, guide, member panel, `/api/v1` catalog and error codes all
  describe the pause, with numbers from the pricing file.
- Scoring batch ceiling $2 to $1 a day; each run's spend now lands in
  `ops_events`. `agent-overage-report` emails Mary when a subscription cannot
  be processed.

## Found on the way

- `lib/fetch-cache.js`: `ttlMs | 0` is 32-bit, so any TTL past about 24.8 days
  became one second. The 45-day once-a-month email markers lived one second.
- The allowance alerts went out from `ProposalPulse <noreply@...>` while
  opening "Hi, it's Mary" and asking for a reply nobody could send.

## Decisions made for Mary, each one line to change

- The limit: 5,000 extra calls ($50) per agent per month
  (`max_billable_overage_calls_per_agent_month`). Basis: one more allowance;
  the most a $39 seat can be billed in a month is $89.
- Considered and left out: a Stripe billing threshold to invoice annual
  subscribers' overage early. It cannot be tested without a live subscription,
  and a mistake there re-bills an annual fee.

## Verified

`npm test`; `node build.js`; the 15 validators; Ask MMT eval `--trials 3`
(the cache helper is in its bundle); six guards mutation-tested (free overage
for unbillable agents, auth ignoring the gate, the statement pricing past the
limit, the 32-bit TTL, refused calls counting toward the pause, a pending item
read as no add-on).

Rule worth keeping: before capping what you bill, check what you serve. A
limit on the invoice that is not also a limit on the service turns revenue
risk into cost.
