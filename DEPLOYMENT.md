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

Two Wrangler configs, because the build root differs by path:

- `wrangler.jsonc` (repo root) — used by the git-integrated build, whose root is
  the repo root. Declares `pages_build_output_dir: project/dist` so Pages
  validates the frontend's real output.
- `project/wrangler.jsonc` — used by the CLI, whose cwd is `project/`.

Without the root config, Pages falls back to a root `dist/`, which the monorepo
never creates, and the build fails *after* a successful compile with
`Output directory "dist" not found`.

Cache headers live in `project/public/_headers` and the SPA fallback in
`project/public/_redirects`; both are copied into `project/dist` at build time,
so no dashboard rewrite rules are needed.

### Option A — Git auto-deploy (this is how it is configured)

The production branch is **`master`**. Every push to it builds and deploys.

Verified dashboard settings:

| Setting | Value |
| --- | --- |
| Production branch | `master` |
| Root directory | *(blank — the repo root)* |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `project/dist` |
| Production + Preview var | `VITE_API_URL` = the Neon Function URL |

`VITE_API_URL` is baked in at **build time**, so changing it needs a new build,
not a redeploy of assets. `project/.env.production` also carries the URL as a
committed default, so a fresh project builds against a working backend without
any dashboard variables.

> **pnpm and build scripts.** pnpm 11 refuses to run dependency build scripts
> unless they are approved, and exits non-zero when it skips one. Every package
> that needs a postinstall must be listed under `allowBuilds` in the root
> `pnpm-workspace.yaml`; a missing entry fails the whole Pages build with
> `ERR_PNPM_IGNORED_BUILDS`. When pnpm detects an unapproved build it appends
> its own entry containing the literal string `set this to true or false`,
> which is not valid input — replace it with a real boolean.

### Option B — Wrangler CLI

```bash
cd project
pnpm build
pnpm deploy          # wrangler pages deploy (uses project/wrangler.jsonc)
```

Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment
(or `wrangler login`). The token needs **Cloudflare Pages: Edit**; a read-only
token fails with `Authentication error [code: 10000]`.

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
