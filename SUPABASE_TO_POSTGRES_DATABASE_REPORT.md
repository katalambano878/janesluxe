# Supabase → Postgres Database Report

| Former | Now |
|--------|-----|
| Hosted Supabase Postgres | VPS Postgres (`DATABASE_URL`) |
| PostgREST | In-process compat |
| GoTrue | `lib/db/auth.ts` |
| RLS | App authorization |
| Storage buckets | Local filesystem |
| Realtime | Not required for core flows |

Remaining `@supabase/supabase-js` usage is the browser client against app shims, not hosted DB.
