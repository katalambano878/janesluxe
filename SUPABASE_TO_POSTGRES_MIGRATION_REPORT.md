# Supabase → Postgres Migration Report — Jane's Luxe

## Feature matrix

| Supabase feature | Replacement | Status |
|------------------|-------------|---------|
| Postgres DB | `DATABASE_URL` + `pg` pool | Done |
| PostgREST queries | `lib/db/supabase-compat.ts` | Done (nested embeds fixed) |
| Auth (GoTrue) | `lib/db/auth.ts` JWT + `auth.users` | Done |
| RLS | App-layer `requireAdmin` / `verifyAuth` | Done |
| Storage | Local disk + `/storage/v1` | Done |
| Realtime | Not used / polling where needed | N/A |
| Edge functions | Next.js API routes | Done |
| Service role client | `supabaseAdmin` → pg compat | Done |

## Remaining Supabase package usage

- `@supabase/supabase-js` remains as the **browser** client pointed at app URL shims
- Server uses compat layer when `DATABASE_URL` is set
- No runtime dependency on hosted Supabase once env is cut over

## Schema notes

- Multi-branch: `branches`, `branch_inventory`, `orders.branch_id`
- FK map: `lib/db/fk-map.ts` (Jane's Luxe, 2026-07-19)
- Migrations live under `supabase/migrations/` (historical) + scripts under `scripts/mig-*`
