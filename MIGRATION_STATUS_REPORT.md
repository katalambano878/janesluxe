# Migration Status Report

- Tool: historical Supabase SQL migrations + custom dump scripts
- App mode: plain Postgres when `DATABASE_URL` is set
- Corrective app migrations this session: none (logic/compat fixes only)
- Recommended: apply any pending SQL from `supabase/migrations/` to the VPS DB if schema is incomplete, especially multi-branch (`20260611000000_multi_branch.sql`)
