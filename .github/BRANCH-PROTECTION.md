# Branch Protection — Mission Meets Tech

## Branch Strategy

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production deploys | Require PR + CI pass |
| `staging` | Pre-production validation | Auto-deploys, no protection |
| `feat/*` | Feature development | None — PR into staging or main |
| `fix/*` | Bug fixes | None — PR into main for hotfixes |

## Workflow

```
feature branch → staging PR → validate on deploy preview → main PR → production
```

### Standard Feature Flow
1. Create branch: `git checkout -b feat/my-feature`
2. Develop and commit
3. Push: `git push origin feat/my-feature`
4. Open PR to `staging` (or `main` for hotfixes)
5. CI runs tests + syntax check
6. Review + merge
7. If staging: validate on deploy preview, then PR staging → main

### Hotfix Flow
1. Create branch from main: `git checkout -b fix/urgent-bug main`
2. Fix and commit
3. PR directly to `main`
4. CI must pass
5. After merge, verify production deploy

## GitHub Settings (Recommended)

### main branch
- Require pull request before merging
- Require approvals: 1
- Require status checks: `test`, `lint`
- No force pushes
- No deletions

### staging branch
- No protection required
- Auto-deploys to Netlify deploy preview
