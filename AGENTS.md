# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Oftalmo App is a React + Vite SPA (in Portuguese) for ophthalmology training management. It uses Supabase (cloud-hosted) as its backend for auth, database, storage, and edge functions. See `README.md` for full setup docs.

### Running services

- **Dev server**: `npm run dev -- --host 0.0.0.0 --port 5173` — serves the app at `http://localhost:5173`
- The app requires Supabase credentials in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Without real credentials the app falls back to `http://localhost:54321` and login will fail with "Failed to fetch".

### Lint / Typecheck / Build

- `npm run lint` — ESLint (passes clean)
- `npm run typecheck` — TypeScript checking via `tsc -p ./jsconfig.json`. Pre-existing type errors exist in the JS codebase; exit code 2 is normal.
- `npm run build` — Vite production build (passes clean)

### Gotchas

- No automated test suite exists in this repo (no test runner configured).
- The codebase is JavaScript (`.js` / `.jsx`), not TypeScript, but uses `jsconfig.json` with `checkJs: true` for type checking. The typecheck step produces errors that are pre-existing and not regressions.
- Supabase edge functions (`supabase/functions/`) are Deno-based and deployed separately via `supabase functions deploy`. They are not needed for local frontend development.
