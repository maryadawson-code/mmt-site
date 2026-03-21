# Branch Protection — `main`

## Current Status

Branch protection enabled via `gh api` on 2026-03-20.

### Rules Applied

| Setting | Value |
|---------|-------|
| Required status checks | `test` (strict mode) |
| Enforce admins | No (Mary can emergency push) |
| Require PR reviews | No |
| Allow force pushes | No |
| Allow deletions | No |

### To Strengthen Later

When the team grows or after stabilization:
1. Require at least 1 PR review before merging
2. Add more required status checks: `build`, `lint`
3. Enable `enforce_admins` to prevent bypasses

### Emergency Push

Mary can push directly to `main` since `enforce_admins` is off.
For emergencies only — prefer PRs for normal workflow.
