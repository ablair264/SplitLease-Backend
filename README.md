Lease Analyzer Backend (Railway + Supabase)

Express API to power the Lease Analyzer frontend. Runs on Railway, connects to your Supabase Postgres, and supports CSV/XLSX uploads processed entirely in memory (no disk).

Endpoints
- `GET /health` – DB connectivity check
- `GET /api/best-deals`
- `GET /api/best-deals/terms/:term/:mileage`
- `GET /api/vehicle/:id/offers`
- `GET /api/dashboard/stats`
- `GET /api/filters`
- `GET /api/search?q=...`
- `POST /api/upload` – multipart form with `file`, `providerName`, `fieldMappings`
- `POST /api/refresh-cache`

Environment
Copy `.env.example` to `.env` (for local dev) and set:

- `PORT=3001` (Railway injects `PORT`; you don’t need to set it)
- `DATABASE_URL` – Your Supabase Postgres connection string (prefer the pooled connection string)
- `PGSSLMODE=require` – Supabase requires SSL
- `CORS_ORIGIN` – Optional, e.g. `http://localhost:5173` (defaults to `*`)

Example Supabase pooled URL: `postgres://USER:PASSWORD@aws-...pooler.supabase.com:6543/postgres`.

Supabase prerequisites
- Schema and functions already live in Supabase (from your `schema.sql` and `queries.sql`).
- Extensions: enable `pg_trgm` (used by `similarity(...)`). In SQL editor: `create extension if not exists pg_trgm;`
- RLS is irrelevant for direct Postgres connections used here (it applies to Supabase REST). Ensure the database user in `DATABASE_URL` has privileges on your objects.

Deploy on Railway
1. Create a new Railway project.
2. Add a service from this folder (or connect your repository and select this `lease-analyzer-backend` directory).
3. In Variables, set:
   - `DATABASE_URL` (from Supabase; pooled recommended)
   - `PGSSLMODE=require`
   - Optional: `CORS_ORIGIN`
4. Deploy. Railway runs `npm start` by default and the server binds to `PORT`.
5. Open Logs; you should see: `Lease Analysis API server running on port ...`.
6. Hit `/health` to verify DB connectivity.

Local development
- `npm install`
- Set `.env` with your Supabase `DATABASE_URL` and `PGSSLMODE=require`.
- `npm start` then test endpoints at `http://localhost:3001`.

Notes
- Uploads: uses Multer `memoryStorage()` and parses Excel via `xlsx` and CSV via `csv-parser` from Buffer. No disk access needed.
- DB calls align with your Supabase functions (e.g., `insert_lease_offer` signature and order from `queries.sql`).
- Cache refresh (`refresh_all_best_deals`) is kicked off in the background after uploads.

