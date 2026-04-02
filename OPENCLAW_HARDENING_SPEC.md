# OpenClaw Agent Hardening Spec

> Full-spectrum runtime hardening standard for the Mary Womack ecosystem.
>
> Applies to: `missionpulse`, `integritypulse`, associated Supabase projects, n8n workflows, GitHub Actions, and GCP-connected agent infrastructure.

---

## Table of Contents

* [Purpose](#purpose)
* [Scope](#scope)
* [Global Operating Doctrine](#global-operating-doctrine)
* [Universal Halt Conditions](#universal-halt-conditions)
* [Execution Standard](#execution-standard)
* [Sprint 1 — Security Foundations](#sprint-1--security-foundations)

  * [S1-01 — Privileged Secret Leakage Scan](#s1-01--privileged-secret-leakage-scan)
  * [S1-02 — Supabase RLS and Policy Audit](#s1-02--supabase-rls-and-policy-audit)
  * [S1-03 — Remediate CRITICAL and HIGH RLS Findings](#s1-03--remediate-critical-and-high-rls-findings)
  * [S1-04 — Supabase Storage and File Exposure Audit](#s1-04--supabase-storage-and-file-exposure-audit)
  * [S1-05 — Security Lint Gates in GitHub Actions](#s1-05--security-lint-gates-in-github-actions)
* [Sprint 2 — Test Integrity](#sprint-2--test-integrity)

  * [S2-01 — Audit Mocked and Hardcoded Tests](#s2-01--audit-mocked-and-hardcoded-tests)
  * [S2-02 — Real Integration Tests for Data-Writing Surfaces](#s2-02--real-integration-tests-for-data-writing-surfaces)
  * [S2-03 — Adversarial Integration Tests](#s2-03--adversarial-integration-tests)
  * [S2-04 — CI Gates for Integration and Adversarial Tests](#s2-04--ci-gates-for-integration-and-adversarial-tests)
* [Sprint 3 — Structural Erosion](#sprint-3--structural-erosion)

  * [S3-01 — Complexity Baseline](#s3-01--complexity-baseline)
  * [S3-02 — Duplication and Verbosity Baseline](#s3-02--duplication-and-verbosity-baseline)
  * [S3-03 — `CLAUDE.md` Behavioral Contracts](#s3-03--claudemd-behavioral-contracts)
  * [S3-04 — Critical Surface Risk Inventory](#s3-04--critical-surface-risk-inventory)
* [Sprint 4 — Contracts, Validation, and Silent Failure Prevention](#sprint-4--contracts-validation-and-silent-failure-prevention)

  * [S4-01 — Strict Schema Validation at Every External Boundary](#s4-01--strict-schema-validation-at-every-external-boundary)
  * [S4-02 — Versioned Schema Contracts for Handoffs](#s4-02--versioned-schema-contracts-for-handoffs)
  * [S4-03 — Fail CI on Breaking Contract Changes](#s4-03--fail-ci-on-breaking-contract-changes)
  * [S4-04 — Audit Logging for Every Mutation Path](#s4-04--audit-logging-for-every-mutation-path)
  * [S4-05 — Dead-Letter Queue and Low-Confidence Routing](#s4-05--dead-letter-queue-and-low-confidence-routing)
* [Sprint 5 — Observability, Traceability, and Root-Cause Recovery](#sprint-5--observability-traceability-and-root-cause-recovery)

  * [S5-01 — End-to-End Correlation IDs](#s5-01--end-to-end-correlation-ids)
  * [S5-02 — Structured Logging Standard](#s5-02--structured-logging-standard)
  * [S5-03 — Failure Taxonomy and Alert Routing](#s5-03--failure-taxonomy-and-alert-routing)
* [Sprint 6 — Durable State, Resume, and Idempotent Execution](#sprint-6--durable-state-resume-and-idempotent-execution)

  * [S6-01 — Agent Task State Table](#s6-01--agent-task-state-table)
  * [S6-02 — Checkpoint Wrappers for Long-Running Workflows](#s6-02--checkpoint-wrappers-for-long-running-workflows)
  * [S6-03 — Exponential Backoff on External Calls](#s6-03--exponential-backoff-on-external-calls)
  * [S6-04 — Idempotency for Retryable Write Paths](#s6-04--idempotency-for-retryable-write-paths)
* [Sprint 7 — Deployment Reality](#sprint-7--deployment-reality)

  * [S7-01 — Post-Deploy Smoke Tests](#s7-01--post-deploy-smoke-tests)
  * [S7-02 — Promotion Blocking and Rollback Criteria](#s7-02--promotion-blocking-and-rollback-criteria)
  * [S7-03 — Canary and Runtime Verification](#s7-03--canary-and-runtime-verification)
* [Sprint 8 — Human Review Guardrails](#sprint-8--human-review-guardrails)

  * [S8-01 — PR Checklist Templates](#s8-01--pr-checklist-templates)
  * [S8-02 — Branch Protection on `main`](#s8-02--branch-protection-on-main)
  * [S8-03 — Small, Reviewable PR Surfaces](#s8-03--small-reviewable-pr-surfaces)
* [Sprint 9 — Infrastructure and Workflow Robustness](#sprint-9--infrastructure-and-workflow-robustness)

  * [S9-01 — n8n Workflow Audit](#s9-01--n8n-workflow-audit)
  * [S9-02 — GCP Service Interaction Audit](#s9-02--gcp-service-interaction-audit)
  * [S9-03 — Infrastructure Drift and Unsafe Defaults](#s9-03--infrastructure-drift-and-unsafe-defaults)
* [Sprint 10 — Final Runtime Proof and Sign-Off](#sprint-10--final-runtime-proof-and-sign-off)

  * [S10-01 — Re-run Baselines and Compare Deltas](#s10-01--re-run-baselines-and-compare-deltas)
  * [S10-02 — Final Evidence Bundle](#s10-02--final-evidence-bundle)
* [Final Human Sign-Off Commands](#final-human-sign-off-commands)
* [Final Pass Criteria](#final-pass-criteria)

---

## Purpose

This spec defines the runtime-hardening standard for AI-generated and agent-maintained systems in the Mary Womack ecosystem.

It is designed to eliminate the most damaging failure modes associated with agentic code generation and orchestration, including:

* privileged secret leakage
* broken or missing row-level security
* public storage exposure
* mocked confidence and false-green CI
* append-only structural erosion
* silent data corruption
* contract drift between workflows
* missing observability across agent hops
* duplicate writes during retries and resume flows
* deployment paths that build successfully but fail at runtime
* reviewer overload caused by oversized, mixed-purpose PRs

This is a **runtime truth** standard, not a local-completion standard.

---

## Scope

This spec applies to all active surfaces in scope:

* `missionpulse`
* `integritypulse`
* Supabase database schemas, policies, edge functions, storage buckets, and secrets handling
* n8n workflows, node contracts, retries, error branches, and DLQ handling
* GitHub Actions, CI/CD, and branch protection rules
* GCP services, service accounts, APIs, storage, and runtime integrations
* any backend service, worker, cron, function, webhook, or queue consumer that touches:

  * user data
  * system state
  * uploads
  * external APIs
  * AI-generated transformations

---

## Global Operating Doctrine

These rules are non-negotiable.

### Core Rules

* **Runtime correctness beats local success.**
  A task is not complete because code compiles or local tests pass. It is complete only when the required runtime verification has passed.

* **Security, RLS, and data integrity are never traded for convenience.**
  Do not bypass auth friction with service-role credentials, disabled policies, public buckets, or relaxed validation.

* **No mocked confidence as proof of correctness.**
  Unit tests are supplemental. Critical paths require integration and adversarial runtime verification.

* **No weakening tests to satisfy builds.**
  Never rewrite a test to make it easier to pass. Fix the code, environment, schema, or policy.

* **No append-only patching.**
  If a function, workflow, or config is already structurally degraded, refactor before adding new behavior.

* **All write paths must be replay-safe.**
  Retries, resumes, and duplicate event delivery must not create duplicate or contradictory writes.

* **All cross-system payloads require explicit versioned contracts.**
  No implicit JSON handoffs. No best-effort parsing.

* **All production-significant actions must be observable end-to-end.**
  Every workflow hop must be traceable via correlation ID.

* **No evidence, no completion.**
  Every ticket must produce concrete artifacts or command output proving closure.

### Forbidden Shortcuts

The following are forbidden:

* using `SUPABASE_SERVICE_ROLE_KEY` in any client-side or browser-exposed runtime
* disabling RLS to resolve application errors
* using `user_metadata` in security policies
* swallowing exceptions to keep workflows green
* passing unvalidated LLM output to downstream writes
* marking a ticket complete without runtime evidence
* merging large mixed-purpose PRs that combine security, refactor, and product logic in one review surface

### Required Output for Every Ticket

For every ticket, produce:

1. what changed
2. exact files, workflows, tables, or configs touched
3. evidence produced
4. residual risks, if any
5. whether the ticket is fully closed or blocked

---

## Universal Halt Conditions

Stop immediately and report if any of the following are discovered:

* a Supabase table with PHI-adjacent or sensitive-user columns and no RLS
* a service role key or equivalent privileged secret in browser-exposed code
* a public storage bucket holding sensitive, user-generated, or operational data
* any workflow that writes data without validation, audit logging, or an error branch
* any critical-path function with cyclomatic complexity greater than 25
* any agent loop making repeated external calls without retry and idempotency strategy
* any cross-user data exposure in staging or production verification
* any deployment path that cannot be smoke-tested before promotion

Do not continue until the condition is explicitly addressed or escalated.

---

## Execution Standard

* **Sprint order is mandatory.** Do not reorder sprints.
* **Do not skip tickets.**
* **Do not auto-merge PRs.**
* **Every completion claim requires evidence.**
* **If a ticket reveals a more severe issue than the ticket itself, halt and report it immediately.**
* **Do not paper over failing runtime conditions with mocks, bypass keys, relaxed policies, or silent exception handling.**
* **Do not close a ticket merely because a script ran.** Close it only when the underlying failure mode has been materially addressed.

---

# Sprint 1 — Security Foundations

**Objective:** Eliminate highest-blast-radius security failures introduced during AI-assisted scaffolding.

## S1-01 — Privileged Secret Leakage Scan

Search all repos for:

* `SUPABASE_SERVICE_ROLE_KEY`
* `SERVICE_ROLE`
* `SUPABASE_SECRET`
* GCP service account keys
* GitHub tokens
* Slack webhooks
* SMTP credentials
* JWT signing keys
* `.env` values copied into source
* any secret referenced in client-side runtime code

Search the following locations at minimum:

* `/src`
* `/app`
* `/pages`
* `/components`
* `/public`
* frontend config files
* workflow exports
* edge function configs
* CI definitions

### Pass Criteria

* zero privileged secret references in any client-side or browser-exposed path
* service role keys are only permitted in secure backend execution contexts that are not shipped to the client

### If Any Hit Is Found

* extract file path and line number
* classify exposure type
* remove or replace the secret usage
* rotate the exposed secret if actual value leakage is confirmed or likely
* open a GitHub issue tagged `CRITICAL-SECURITY`
* do not proceed until exposure is contained

## S1-02 — Supabase RLS and Policy Audit

Run Splinter or equivalent Supabase SQL lint against each project. Capture all `EXTERNAL` findings, including but not limited to:

* `0013` — RLS disabled on public table
* `0008` — RLS enabled but no policy exists
* `0002` — `auth.users` exposed
* `0010` — security definer view bypassing RLS
* `0015` — RLS policy references `user_metadata`
* `0003` — `auth.uid()` in initplan
* `0001` — unindexed foreign keys referenced in RLS
* any exposed sensitive columns
* any storage access misconfigurations surfaced by the tool

### Output Only

* lint ID
* affected object
* severity
* short description

Do not auto-fix in this ticket.

## S1-03 — Remediate CRITICAL and HIGH RLS Findings

For each CRITICAL or HIGH finding:

* enable RLS if missing
* create least-privilege policies
* use `auth.uid()` matched against an existing ownership column such as `user_id`
* never use `user_metadata`
* if the required ownership column does not exist, halt and report — do not invent schema without explicit migration rationale
* remove or replace any security definer pattern that bypasses intended access controls
* add required indexes for policy-supported access paths where applicable

### Migration Output

Save all SQL to:

```text
/supabase/migrations/YYYYMMDD_rls_hardening.sql
```

### Hard Rule

No table exposed to authenticated users may remain without both RLS and explicit policy intent.

## S1-04 — Supabase Storage and File Exposure Audit

Audit all storage buckets and file upload paths.

Check:

* public vs private exposure
* signed URL requirements
* upload path authorization
* MIME/type allowlists
* file size limits
* overwrite behavior
* malware or quarantine workflow if uploads exist
* retention and deletion behavior
* whether bucket access assumptions match table-level auth assumptions

### Pass Criteria

* no sensitive or user-associated bucket is publicly readable by default
* upload permissions are least-privilege
* object paths cannot be guessed for unauthorized retrieval
* signed URLs are time-limited where applicable
* upload validation exists before persistence

If a bucket is public and should not be, treat it as `CRITICAL-SECURITY`.

## S1-05 — Security Lint Gates in GitHub Actions

Create or update security workflows to fail PRs when any of the following are detected:

* creation of public tables without RLS enablement
* missing policies after public table creation
* service role references in browser-exposed code
* privileged secrets in committed source
* unsafe storage bucket config files or IaC defaults
* migrations that create sensitive tables without explicit ownership model

### Pass Criteria

Security checks are required status checks for merge on both repos.

---

# Sprint 2 — Test Integrity

**Objective:** Replace green-but-meaningless CI with reality-based verification.

## S2-01 — Audit Mocked and Hardcoded Tests

Scan all repos for:

* `jest.mock`
* `vi.mock`
* `sinon.stub`
* `MagicMock`
* `patch(`
* test doubles around database and auth layers
* hardcoded returns like `return True`, `return {}`, `return []`, or fixed success payloads

### Output

* total mock or stub count
* total suspect hardcoded return count
* list of test files that appear to validate abstractions rather than actual behavior

Do not delete yet. This is the baseline.

## S2-02 — Real Integration Tests for Data-Writing Surfaces

For each repo and each data-writing path:

* connect to a real test database or isolated test schema
* insert a real record
* assert persistence through a real read path
* assert authorization boundaries using a second identity
* test update path
* test delete path
* test duplicate-delivery or replay-safe behavior where applicable

### Required Test Environment

* `SUPABASE_TEST_URL`
* `SUPABASE_TEST_ANON_KEY`
* any additional isolated test credentials needed for identity switching

### Hard Rule

No agent output that writes to Supabase is accepted without a passing real-data integration test.

## S2-03 — Adversarial Integration Tests

Add tests specifically designed to break generated logic.

Include:

* unauthorized cross-user read attempt
* unauthorized cross-user update attempt
* null identity or missing auth context
* malformed payloads
* partial payloads
* duplicate event delivery
* out-of-order event delivery where applicable
* race condition test for concurrent writes on the same logical record
* retry collision behavior
* stale update overwrite attempt
* file upload abuse attempt if upload logic exists

### Pass Criteria

Critical data paths are tested not just for success, but for abuse, replay, and invalid-state behavior.

## S2-04 — CI Gates for Integration and Adversarial Tests

Update CI so a PR is not green unless all of the following pass:

* unit tests
* integration tests
* adversarial tests

A green unit-only build is invalid signal.

---

# Sprint 3 — Structural Erosion

**Objective:** Stop append-only degradation and make future agent work safer.

## S3-01 — Complexity Baseline

Run complexity scans appropriate to each stack.

### Required Output

* total average cyclomatic complexity
* all functions rated D, E, or F
* any function exceeding 15 marked as a mandatory refactor target
* any critical-path function exceeding 10 marked as a no-append zone
* any critical-path function exceeding 25 triggers immediate halt

### Save To

* `complexity_report.json`
* repo root

Commit it.

## S3-02 — Duplication and Verbosity Baseline

Detect:

* duplicate function bodies
* clone blocks
* repeated condition trees
* repeated validation logic
* duplicated API-call wrappers
* repeated audit-log emission code that should be centralized

### Output

* total duplications flagged
* files with 3 or more duplicate patterns
* recommended extraction targets

### Save To

```text
duplication_report.txt
```

Do not auto-fix unless a later ticket requires it.

## S3-03 — `CLAUDE.md` Behavioral Contracts

Every repo must have a root `CLAUDE.md` that enforces:

* no append-only iteration
* no mock rewrites
* no exception swallowing
* no hardcoded test returns
* no service role usage in client code
* cyclomatic complexity ceiling
* mandatory schema validation at external boundaries
* mandatory idempotency for retryable writes
* mandatory audit logging for mutations
* mandatory correlation IDs for multi-step workflows
* mandatory post-deploy smoke-test evidence for critical paths

Commit to every repo missing it.

## S3-04 — Critical Surface Risk Inventory

Create a machine-readable inventory of:

* auth-related files
* data-writing functions
* migration handlers
* webhook entrypoints
* workflow orchestrators
* retry wrappers
* schema validators
* upload handlers

For each critical file:

* assign risk level
* note current complexity score
* mark whether new behavior is allowed or refactor-first is required

### Save As

```text
critical_surface_inventory.json
```

---

# Sprint 4 — Contracts, Validation, and Silent Failure Prevention

**Objective:** Prevent valid-looking garbage from moving through the system.

## S4-01 — Strict Schema Validation at Every External Boundary

Every boundary must validate before processing, including:

* n8n webhooks
* API requests
* Supabase realtime events
* queue messages
* GCP Pub/Sub payloads
* third-party API responses
* LLM structured outputs
* file metadata
* workflow handoff payloads

Use:

* Pydantic for Python
* Zod for TypeScript

### Hard Rules

* reject invalid payloads
* log validation failure
* do not continue downstream
* never coerce away materially missing or malformed required fields without explicit specification

## S4-02 — Versioned Schema Contracts for Handoffs

Every producer-consumer payload must have:

* explicit schema
* explicit version
* field semantics
* null and default semantics
* compatibility expectations
* transformation rules if shape changes
* ownership of contract

Create a `contracts/` directory or equivalent and register all active handoff schemas.

### Pass Criteria

No workflow or agent handoff relies on undocumented implicit JSON structure.

## S4-03 — Fail CI on Breaking Contract Changes

If a schema contract changes:

* detect version change
* run compatibility checks against downstream consumers
* fail CI if a breaking change is introduced without coordinated update
* require explicit migration note for contract evolution

## S4-04 — Audit Logging for Every Mutation Path

Every `INSERT`, `UPDATE`, `DELETE`, `TRANSFORM`, `UPSERT`, and externally triggered state change must emit an audit log.

### Minimum Fields

* `correlation_id`
* `task_id` if applicable
* `agent_name`
* `operation`
* `table_name` or target resource
* `record_id` or resource identifier
* `schema_version`
* `payload_hash`
* `actor context`
* `status`
* `error_detail`
* `created_at`

Create `agent_audit_log` if missing.

### Hard Rule

If audit-log write fails, the mutation must halt unless the operation is explicitly designated fail-open by written exception policy. Default behavior is **fail closed**.

## S4-05 — Dead-Letter Queue and Low-Confidence Routing

For every n8n or agent workflow involving transformation or LLM output:

Detect:

* empty output
* parse failure
* missing required fields
* schema mismatch
* suspiciously short output
* unknown enum or state values
* confidence failure conditions defined by the step contract

Route failures to a dead-letter queue:

* dedicated Supabase table or GCS bucket
* include correlation ID, workflow ID, payload snapshot, failure reason, and timestamp

Emit alert via Slack or email when anything lands there.

### Hard Rule

No low-confidence output may proceed to a downstream write.

---

# Sprint 5 — Observability, Traceability, and Root-Cause Recovery

**Objective:** Make silent failures diagnosable instead of mysterious.

## S5-01 — End-to-End Correlation IDs

Every multi-step operation must propagate:

* `correlation_id`
* `task_id` where applicable
* `workflow_id`
* `schema_version`
* `user_id` or actor identifier if safe and appropriate
* originating trigger source

This must flow through:

* API ingress
* n8n steps
* queue messages
* DB writes
* audit logs
* DLQ entries
* external API call wrappers
* error logs

## S5-02 — Structured Logging Standard

All logs must be structured and machine-parseable.

### Minimum Log Dimensions

* timestamp
* severity
* service, repo, or workflow name
* agent_name
* correlation_id
* task_id
* operation
* target resource
* status
* error_class
* retry_count
* environment

Replace free-form logs where critical workflows depend on them for diagnosis.

## S5-03 — Failure Taxonomy and Alert Routing

Define and emit explicit failure classes such as:

* `VALIDATION_ERROR`
* `AUTHORIZATION_BLOCKED`
* `RLS_MISCONFIG`
* `SCHEMA_MISMATCH`
* `RETRY_EXHAUSTED`
* `DUPLICATE_EVENT_DETECTED`
* `DLQ_ROUTED`
* `AUDIT_LOG_FAILURE`
* `SMOKE_TEST_FAILURE`
* `CONTRACT_BREAKING_CHANGE`
* `UPLOAD_POLICY_VIOLATION`

Create alert routing for high-severity failure classes.

---

# Sprint 6 — Durable State, Resume, and Idempotent Execution

**Objective:** Prevent partial work, duplicate work, and unrecoverable mid-flight failure.

## S6-01 — Agent Task State Table

Create durable checkpoint state storage if missing.

### Minimum Fields

* `task_id`
* `agent_name`
* `status`
* `checkpoint_data`
* `retry_count`
* `max_retries`
* `last_updated`
* `created_at`
* `correlation_id`

Enable RLS appropriately if user-scoped access exists. If backend-only, keep access restricted.

## S6-02 — Checkpoint Wrappers for Long-Running Workflows

Any function or workflow that:

* runs longer than 30 seconds, or
* makes more than 3 external API calls, or
* crosses multiple systems, or
* writes in multiple stages

must:

* checkpoint after each major step
* resume safely after restart
* record current state and next step
* detect and avoid duplicate completion on replay

## S6-03 — Exponential Backoff on External Calls

No bare external calls.

Apply backoff to:

* GCP APIs
* Supabase calls inside loops or orchestrations
* n8n HTTP request nodes
* third-party APIs
* Gmail, Calendar, or similar orchestration calls
* webhook callbacks where retries are meaningful

Retry wrappers must log attempts and classify exhaustion.

## S6-04 — Idempotency for Retryable Write Paths

Every retryable or replayable write path must define:

* idempotency key source
* deduplication window
* duplicate detection rule
* replay-safe behavior
* partial-success recovery behavior

Add tests for:

* duplicate request replay
* resume after partial success
* repeated queue delivery
* timeout followed by retry

### Hard Rule

Do not add retries to a write path unless replay safety is also defined.

---

# Sprint 7 — Deployment Reality

**Objective:** Catch builds that succeed while runtime remains broken.

## S7-01 — Post-Deploy Smoke Tests

For staging and preview deploys, run automated smoke tests that:

* authenticate as a safe test identity
* visit critical pages or endpoints
* assert no error boundary or crash state
* verify real DB connectivity
* verify a safe read path
* verify a safe write path if non-destructive and appropriate
* verify file upload path if applicable
* verify critical workflow trigger path if applicable

Use headless browser or API-based smoke checks as appropriate.

### Pass Criteria

Critical-path smoke suite must pass before promotion to production.

## S7-02 — Promotion Blocking and Rollback Criteria

A deploy must not promote if any of the following occur:

* smoke test failure
* auth regression
* schema compatibility failure
* DLQ spike above threshold during canary
* audit log failure on critical mutation
* unauthorized access test regression
* storage access regression

Document rollback triggers and rollback steps in repo-visible ops documentation.

## S7-03 — Canary and Runtime Verification

For systems with production rollout control:

* deploy to limited exposure first
* monitor critical errors, validation failures, DLQ rates, and auth failures
* block full rollout on anomaly threshold breach

---

# Sprint 8 — Human Review Guardrails

**Objective:** Protect the human reviewer from agent-generated overload.

## S8-01 — PR Checklist Templates

Each repo must have `.github/pull_request_template.md` including:

* unit tests passing
* integration tests passing
* adversarial tests passing
* security lint passing
* no privileged secret leakage
* no new tables without RLS and policies
* no new uploads without access controls
* no new external calls without retry and validation
* no new write paths without audit log and idempotency
* no critical-path changes without smoke-test evidence
* no breaking contract changes without downstream updates
* no large mixed-purpose PRs
* cooling period before merge

## S8-02 — Branch Protection on `main`

Require at minimum:

* security lint
* integration tests
* adversarial tests
* smoke-test verification for deployment-affecting PRs
* at least one approving review
* stale review dismissal on new commits
* admin enforcement

## S8-03 — Small, Reviewable PR Surfaces

For any generated PR:

* separate security remediations from refactors
* separate refactors from product logic
* keep blast radius constrained
* generate machine-readable review summary including:

  * touched critical surfaces
  * security impact
  * contract changes
  * migration impact
  * rollback plan
  * evidence links or command outputs

A PR that is too large to cold-review safely must be split before requesting review.

---

# Sprint 9 — Infrastructure and Workflow Robustness

**Objective:** Harden orchestrators and runtime wiring, not just repo code.

## S9-01 — n8n Workflow Audit

For every n8n workflow:

* verify every node with failure potential has an error path
* verify every LLM or transform step validates output before passing on
* verify no data write occurs without prior validation
* verify retries do not create duplicate writes
* verify DLQ exists where required
* verify alerts fire on failure routes

### Hard Rule

Any n8n workflow node with no meaningful error branch on a critical path is a halt condition.

## S9-02 — GCP Service Interaction Audit

For every GCP interaction:

* validate auth model
* ensure least-privilege service account usage
* ensure no raw credentials are embedded
* ensure retry and backoff exists where needed
* ensure idempotency exists for repeatable operations
* ensure logs include correlation IDs
* ensure any storage or object exposure is aligned to intended access model

## S9-03 — Infrastructure Drift and Unsafe Defaults

Review and remediate where material risk exists:

* CI secrets usage
* environment scoping
* preview, staging, and prod separation
* accidental prod credential use in tests
* unprotected webhooks
* permissive CORS
* unbounded cron retries
* missing rate limits at ingress where appropriate

---

# Sprint 10 — Final Runtime Proof and Sign-Off

**Objective:** Produce evidence that the system is materially safer, more deterministic, and harder to silently corrupt.

## S10-01 — Re-run Baselines and Compare Deltas

Re-run all applicable baselines:

* security scans
* RLS lint
* storage audit
* mock and stub audit
* integration tests
* adversarial tests
* complexity scan
* duplication scan
* contract validation
* smoke tests

Show before-and-after deltas where a baseline exists.

## S10-02 — Final Evidence Bundle

Create a final sign-off bundle containing:

* zero privileged secret hits in client-side code
* full list of RLS findings resolved
* storage exposure findings resolved
* integration and adversarial test results
* complexity report
* duplication report
* contract registry summary
* smoke-test results
* branch protection status
* remaining open risks, if any
* explicit list of blocked items, if any

---

## Final Human Sign-Off Commands

Run and attach output for human review:

```bash
echo "=== PRIVILEGED SECRET EXPOSURE ===" && \
grep -RniE "SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|AIza|ghp_|xoxb-|BEGIN PRIVATE KEY" src/ app/ pages/ components/ public/ .github/ 2>/dev/null | wc -l && \
echo "=== RLS / POLICY AUDIT COMPLETE ===" && \
echo "Attach latest Splinter or equivalent report" && \
echo "=== STORAGE EXPOSURE AUDIT COMPLETE ===" && \
echo "Attach latest bucket access report" && \
echo "=== COMPLEXITY ===" && \
radon cc . -nd --total-average 2>/dev/null || true && \
echo "=== INTEGRATION TESTS ===" && \
pytest tests/integration/ --tb=short -q 2>/dev/null || npx vitest run tests/integration/ --reporter=verbose && \
echo "=== ADVERSARIAL TESTS ===" && \
pytest tests/adversarial/ --tb=short -q 2>/dev/null || npx vitest run tests/adversarial/ --reporter=verbose && \
echo "=== CONTRACT CHECKS ===" && \
echo "Attach contract compatibility results" && \
echo "=== SMOKE TESTS ===" && \
echo "Attach latest staging or preview smoke results"
```

---

## Final Pass Criteria

All of the following must be true:

* zero privileged secret hits in browser-exposed code
* no critical RLS or storage exposure findings left unresolved
* integration tests green
* adversarial tests green
* critical-path smoke tests green
* audit logging active on all mutation paths
* idempotency defined on all retryable write paths
* contract registry exists and CI enforces compatibility
* branch protections active
* remaining risks explicitly listed and accepted by human review only

---

## Completion Standard

This spec is complete only when the underlying failure modes have been materially addressed and proven with runtime evidence.

A passing local build is not enough.
A green mock-heavy test suite is not enough.
A clean PR is not enough.

**Runtime proof is the standard.**
