# Deployment — Cloudflare Pages (frontend) + Neon Function (backend)

This repo is a single pnpm monorepo with a split deployment:

| Piece | Where it runs | Deployed by |
|---|---|---|
| `project/` frontend (Vite + React SPA) | **Cloudflare Pages** | Git auto-deploy or `pnpm deploy:web` (Wrangler) |
| `server/app.ts` API (Hono) | **Neon Function** on your Neon branch | `pnpm deploy:api` (`neon deploy`) |
| Postgres schema + data | **Neon Postgres** (same branch) | `pnpm db:migrate` (`drizzle-kit`) |

Both halves live in **one** git repo — `project/` is tracked at the repo root
(not a submodule, not a separate repository). Cloudflare Pages builds it from
the monorepo with **root directory = `project/`**.

## Prerequisites

```bash
pnpm --version    # 11.x (declared via packageManager in package.json)
neon --version    # Neon CLI, linked via `neon link`
```

Install once from the repo root (installs `project/` and `server/` together):

```bash
pnpm install
```

## Root scripts

| Command | Does |
|---|---|
| `pnpm dev` | Vite dev server for `project/` |
| `pnpm build` | Production build of `project/` → `project/dist` |
| `pnpm typecheck` | Typecheck both packages |
| `pnpm test` | Frontend test suite |
| `pnpm deploy:web` | Build + deploy to Cloudflare Pages (Wrangler) |
| `pnpm deploy:api` | Deploy the Neon Function (`neon deploy --env .env.local`) |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migration generate / apply |

---

## 1. Frontend → Cloudflare Pages

The Pages project is declared in `project/wrangler.jsonc`
(`name: genanki`, `pages_build_output_dir: dist`). Cache headers live in
`project/public/_headers` and the SPA fallback in `project/public/_redirects` —
both are copied into `dist/` at build time, so no dashboard rewrite rules are
needed.

### Option A — Git auto-deploy (recommended)

1. Push the monorepo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Configure the build:
   - **Root directory:** `project`
   - **Build command:** `pnpm build`
   - **Build output directory:** `dist`
   - **Environment variables (Production + Preview):**
     - `VITE_API_URL` = your Neon Function URL, e.g.
       `https://br-super-river-ayazioha-api.compute.c-5.us-east-2.aws.neon.tech`
4. Save. Every push to the connected branch builds and deploys automatically.

> `VITE_API_URL` is baked in at **build time** — changing it requires a new
> build, not just a redeploy of assets.

### Option B — Wrangler CLI

```bash
cd project
pnpm build
pnpm deploy          # wrangler pages deploy (uses wrangler.jsonc)
```

Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment
(or `wrangler login`).

---

## 2. Backend → Neon Function

The deploy config lives in `neon.ts` (repo root). Required secrets
(`ENCRYPTION_PEPPER`, `ADMIN_SECRET`) fail the deploy if missing; provider keys
are optional and disable their provider when absent.

```bash
# One-time: link the repo to your Neon project
neon link

# Deploy — loads .env.local into the Function env
pnpm deploy:api        # == neon deploy --env .env.local
```

Generate strong secrets before the first deploy:

```bash
openssl rand -hex 32   # ENCRYPTION_PEPPER
openssl rand -hex 32   # ADMIN_SECRET
```

See `.env.example` at the repo root for every variable the server reads.
Root `.env.local` is the single source of truth for the Function environment.

## 3. Database migrations (Drizzle)

Migrations live in `server/drizzle/` and are applied with the **direct**
(unpooled) connection string.

```bash
pnpm db:migrate        # from repo root; == drizzle-kit migrate in server/
```

Verify tables exist:

```bash
node server/scripts/check-tables.mjs pooled
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
  `.env.local` and redeploy the Function (`pnpm deploy:api`). Leaving it empty
  allows all origins — fine for early testing, not for production.
- **API URL:** when the Function URL changes, update `VITE_API_URL` in the
  Cloudflare Pages env vars and rebuild the frontend.
