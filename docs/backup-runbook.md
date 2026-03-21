# Database Backup Runbook

## How Supabase Backups Work

Supabase provides **Point-in-Time Recovery (PITR)** for Pro plan projects and daily backups for all plans.

- **Daily backups:** Automatic, retained for 7 days (Free/Pro) or 30 days (Team/Enterprise)
- **PITR:** Continuous WAL archiving, restore to any second within retention window
- **Docs:** https://supabase.com/docs/guides/platform/backups

## Verify Backups Are Running

1. Go to Supabase Dashboard → your project
2. Navigate to **Database → Backups**
3. Confirm daily backups are listed with recent dates
4. Check that the most recent backup is within the last 24 hours

## Monthly Test Restore Procedure

Perform this on the first Monday of each month.

### Steps

1. **Create a scratch project** in Supabase (free tier is fine)
2. **Download a backup:**
   - Dashboard → Database → Backups → Download latest
3. **Restore to scratch project:**
   ```bash
   psql "postgres://postgres:[password]@[scratch-host]:5432/postgres" < backup.sql
   ```
4. **Verify key tables have data:**
   ```sql
   SELECT COUNT(*) FROM mp_users;
   SELECT COUNT(*) FROM mp_scoring_history;
   SELECT COUNT(*) FROM mp_feature_usage;
   SELECT COUNT(*) FROM marketpulse_orders;
   SELECT COUNT(*) FROM dashboard_users;
   SELECT COUNT(*) FROM ops_events;
   ```
5. **Compare counts** with production (Dashboard → Table Editor → row counts)
6. **Delete the scratch project** after verification
7. **Log results** in this file's Restore Log section below

### What "Pass" Looks Like

- All tables exist in the restored database
- Row counts match production (within the backup window)
- No schema errors during restore

### What "Fail" Looks Like

- Missing tables → check if migrations are included in backup
- Zero rows in tables that have production data → backup may be corrupted
- Schema errors → contact Supabase support

## Restore Log

| Date | Performed By | Result | Notes |
|------|-------------|--------|-------|
| — | — | — | No test restores performed yet |

## Emergency Restore

If production data is lost or corrupted:

1. **Do not panic.** Supabase retains backups.
2. Go to Dashboard → Database → Backups
3. Select the backup from before the incident
4. Click "Restore" (this overwrites the current database)
5. Verify critical tables after restore
6. Check application functionality (score-deck, marketpulse, dashboard)
7. Document the incident in `docs/incident-runbook.md`
