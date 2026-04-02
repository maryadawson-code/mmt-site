## Summary
<!-- What does this PR do? Why? -->

## Changes
<!-- Key files/areas changed -->

## Checklist
- [ ] Unit tests passing (`npm test`)
- [ ] Smoke tests passing (`npm run test:smoke`)
- [ ] E2E tests passing (`npm run test:e2e`)
- [ ] Integrity audit passing (`node integrity-audit.js`)
- [ ] Build succeeds (`node build.js`)
- [ ] Security lint passing (no privileged secrets exposed)
- [ ] No new uploads without access controls
- [ ] No new external calls without retry and validation
- [ ] No critical-path changes without smoke-test evidence
- [ ] No breaking contract changes without downstream updates
- [ ] ESLint passes with zero warnings
- [ ] PR is focused (not mixing security, refactor, and product logic)

> **Size guideline**: PRs should be under 400 lines of meaningful changes. Security, refactor, and product changes should be separate PRs.

## Risk Assessment
- **Critical surfaces touched**: <!-- list any auth, billing, or data-writing files -->
- **Security impact**: none / low / medium / high
- **Contract changes**: none / compatible / breaking
- **Rollback plan**: <!-- how to revert if needed -->

## Evidence
<!-- Link to test output, smoke test results, or screenshots -->
