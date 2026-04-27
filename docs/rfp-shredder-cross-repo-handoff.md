# RFP Shredder — Cross-Repo Handoff Contract

mmt-site (`maryadawson-code/mmt-site`) and MissionPulse (`~/Projects/missionpulse`, branch `det-sprint/1-103-determinism-rule`) are separate repositories on separate Netlify projects. RFP Shredder runs on MissionPulse; mmt-site is the consumer / public surface.

This document defines the contract between them so that future agents working in either repo know what they are allowed to assume.

## Repos

| Repo | Path | Branch (current) | Domain |
|---|---|---|---|
| mmt-site | `~/Projects/mmt-site` | `main` | missionmeetstech.com |
| MissionPulse | `~/Projects/missionpulse` | `det-sprint/1-103-determinism-rule` | missionpulse.ai |

## Today (2026-04-27)

- MissionPulse has no `/rfp-shredder/analyze` endpoint shipped to a stable public URL.
- mmt-site has `/rfp-shredder` as a marketing/pilot-signup landing page.
- No live cross-repo traffic flows.

## Planned contract

### Endpoint

```
POST https://api.missionpulse.ai/v1/rfp-shredder/analyze
```

### Auth

mmt-site signs a short-lived JWT (15 min TTL) keyed on a shared secret env var `MMT_TO_MP_SHARED_SECRET`:

```json
{
  "iss": "mmt-site",
  "sub": "<subscriber email, lowercased>",
  "tier": "premium|founding|institutional|admin",
  "iat": <epoch>,
  "exp": <epoch + 900>
}
```

MissionPulse rejects with 401 if:
- `iss != "mmt-site"`
- `tier` is not in the allowed set for the requested operation
- token is expired

### Request

```json
{
  "document_text": "<= 500 KB",
  "document_type": "rfp" | "rfi" | "draft_rfp" | "amendment",
  "jurisdiction": "federal" | "state",
  "agency": "<agency code, optional>",
  "subscriber_context": {
    "entity_name": "...",
    "naics_codes": ["..."],
    "set_aside_certifications": ["..."]
  }
}
```

`subscriber_context` is the same shape as `subscriber_context` in mmt-site's Supabase. Sending it lets MissionPulse run a company-aligned read (vs. generic).

### Response

```json
{
  "run_id": "uuid",
  "ts": "ISO8601",
  "sections": [
    { "id": "L.1", "title": "...", "body": "...", "evaluator_factor": "M.1" }
  ],
  "requirements_matrix": [
    { "id": "REQ-001", "category": "technical|management|past_performance|pricing", "text": "...", "section": "C.5.1" }
  ],
  "lm_traceability": [
    { "l_section": "L.1", "m_factor": "M.1", "satisfies": true, "gap": null }
  ],
  "evaluator_stress": [
    { "section": "C.3", "issue": "...", "severity": "high|medium|low", "fix": "..." }
  ],
  "compliance_gaps": [
    { "framework": "CHPL|FedRAMP|CMMC|SCA|Sec508", "claim": "...", "verified": false, "evidence_url": "..." }
  ],
  "summary": "<= 1500 chars"
}
```

### Failure modes

- **MissionPulse 5xx** — mmt-site shows a generic "RFP Shredder is temporarily unavailable" card with a `mailto:mary@` link. Logs the failure to `ops_events.event_type='rfp_shredder_upstream_error'`.
- **Document too large** — mmt-site refuses with a 413 before forwarding.
- **Tier mismatch** — mmt-site short-circuits; never forwards a request that wouldn't be authorized.
- **Subscriber context blocked** — falls back to generic mode with a banner (same pattern as Pursuit Score / Compliance Check / Signal Chain).

## Repo discipline

- Cross-repo edits land in **separate commits in their respective repos**. mmt-site PRs do not modify MissionPulse files, and vice versa.
- Before working in `~/Projects/missionpulse`, run `git status && git branch --show-current` first and apply the cross-agent stash/snapshot rule.
- The shared secret (`MMT_TO_MP_SHARED_SECRET`) is set in BOTH Netlify environments. Rotation is coordinated; never log the secret.

## Done definition

| Step | Owner | Status |
|---|---|---|
| MissionPulse stable v1 endpoint | MissionPulse repo | not started |
| mmt-site `netlify/functions/rfp-shredder.js` (entitlement gate + JWT signer) | mmt-site repo | not started |
| `/premium/rfp-shredder.html` | mmt-site repo | not started |
| Shared secret env var on both Netlify projects | ops | not started |
| Smoke test from mmt-site preview against MissionPulse staging | both | not started |
| Pricing + caps in `lib/mmt-pricing.js` | mmt-site repo | not started |
| Tools hub Premium section updated | mmt-site repo | not started |
| Mary approval for live launch | Mary | pending |

## Out of scope (today)

- Email/Slack alerts on RFP Shredder runs.
- Multi-tenant org-level shared dissections.
- Long-form (>500 KB) documents.
- State / local solicitations.

These are Phase 2 work after the federal v1 lands.
