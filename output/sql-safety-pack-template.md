# SQL Safety Pack Template

Every migration needs:
1. Purpose (1 sentence)
2. Tables affected
3. Exact SQL
4. Dry run command (BEGIN/ROLLBACK wrapper)
5. Rollback SQL
6. Validation query
7. Data impact (rows, breaking change, RLS update needed)

See supabase/migrations/008-011 for real examples.
