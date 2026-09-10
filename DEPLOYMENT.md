# Deployment — Cloudflare Pages (frontend) + Neon Function (backend)

This repo is a split deployment:

| Piece | Where it runs | Deployed by |
|---|---|---|
| `project/` frontend (Vite + React SPA) | **Cloudflare Pages** | GitHub auto-deploy (connect the repo once in the Cloudflare dashboard) |
| `server/app.ts` API (Hono) | **Neon Function** on your Neon branch | `neon deploy` (CLI) |
| Postgres schema + data | **Neon Postgres** (same branch) | `drizzle-kit migrate` |

> Note: `project/` has its own `.git` and is excluded from this root repo via
> `.gitignore`. For the frontend to auto-deploy from GitHub, either push
> `project/` as its own GitHub repo, or remove `project/` from the root
> `.gitignore` and push the monorepo (adjust the build config accordingly).

---

## 1. Frontend → Cloudflare Pages (auto-deploy from GitHub)

1. Push the frontend to GitHub (see note above).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repo and configure:
   - **Root directory:** `project/` (if deploying the monorepo) or `/`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variables (Production + Preview):**
     - `VITE_API_URL` = your Neon Function URL, e.g.
       `https://br-super-river-ayazioha-api.compute.c-5.us-east-2.aws.neon.tech`
4. Save. Every push to the connected branch now builds and deploys automatically.

The current `project/.env.local` already contains the correct `VITE_API_URL`.
Cloudflare Pages env vars replace it at build time — keep them in sync.

## 2. Backend → Neon Function

The deploy config lives in `neon.ts` (root). Required secrets
(`ENCRYPTION_PEPPER`, `ADMIN_SECRET`) fail the deploy if missing; provider keys
are optional and disable their provider when absent.

```bash
# One-time: link the repo to your Neon project
neon link

# Local deploys — loads .env.local into the Function env
neon deploy --env .env.local
```

Generate strong secrets before the first deploy:

```bash
openssl rand -hex 32   # ENCRYPTION_PEPPER
openssl rand -hex 32   # ADMIN_SECRET
```

See `.env.example` at the repo root for every variable the server reads.

## 3. Database migrations (Drizzle)

Migrations live in `server/drizzle/`. Run from `server/`:

```bash
cd server
# DATABASE_URL_UNPOOLED (direct connection) is required for migrations
npx drizzle-kit migrate
```

Verify tables exist:

```bash
node scripts/check-tables.mjs pooled
```

## 4. Post-deploy smoke checks

```bash
API=https://<your-neon-function-url>

curl -s "$API/"                 # {"ok":true,"service":"genanki-api"}
curl -s "$API/health"           # {"ok":true,"db":"up"}
curl -s "$API/api/providers/catalog"   # provider catalog rows
```

Then in the browser: load the Pages URL, open the AI Deck Builder, generate a
small deck, and confirm the run appears in History.

## 5. Keeping the two deploys in sync

- **CORS:** when your Pages domain changes, update `ALLOWED_ORIGINS` in
  `.env.local` and redeploy the Function (`neon deploy --env .env.local`).
- **API URL:** when the Function URL changes, update `VITE_API_URL` in the
  Cloudflare Pages env vars and rebuild the frontend.
