# Supabase → Postgres Database Report

| Supabase Feature | Previous | PostgreSQL Replacement | Status |
|------------------|----------|----------|------------------------|--------|
| PostgREST API | Hosted | `/rest/v1` + `supabase-compat` | Working |
| Auth (GoTrue) | Hosted | `auth.users` + `/auth/v1` + JWT | Working |
| Service role client | `@supabase/supabase-js` | `supabaseAdmin` → compat when `DATABASE_URL` | Working |
| RLS | Policies | App-layer `requireAdmin` / ownership; policies disabled | Intentional |
| Storage | Supabase Storage | Local disk + `/storage/v1` shim | Working |
| Realtime | Channels | Not used for critical paths; admin uses fetch | OK |
| Edge functions | Supabase functions | Next.js route handlers | Migrated |
| RPCs | Postgres functions | Same functions in public schema | Present |
| Types | Generated | Hand docs + TS inference | No generated types file |

## Remaining `@supabase` usage

- Browser `lib/supabase.ts` (points at app domain REST/auth shims)
- Dual-mode wrappers when plain PG disabled
- Middleware JWT path for plain PG (no remote getUser)

## RLS replacement

Authorization is enforced in Next.js API routes via JWT + `profiles.role`. Browser REST shim is not a substitute for admin APIs for privileged writes.
