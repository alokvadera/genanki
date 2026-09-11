# AGENTS.md — Genanki Codebase Guide for AI Agents

> **Purpose:** Every AI agent that works on this codebase should read this file first. It contains all commands, conventions, and procedures needed to work effectively without breaking anything.

---

## Tech Stack

| Layer           | Technology                                                        |
| --------------- | ----------------------------------------------------------------- |
| Frontend        | React 19, Vite, Tailwind v4, shadcn/ui, Framer Motion             |
| Routing         | React Router v7 (`react-router`, not `react-router-dom`)          |
| Backend         | Neon Functions (Hono REST API) + Drizzle ORM on Lakebase Postgres |
| Auth            | Neon Auth (JWT verified server-side; no frontend auth)            |
| AI              | Groq (primary), Cerebras, OpenRouter, Kilo, Cloudflare Workers AI |
| Package Manager | **pnpm** (not npm)                                                |
| Testing         | Vitest + @testing-library/react                                   |
| Coverage        | Istanbul (via @vitest/coverage-istanbul)                          |
| Linting         | ESLint 9 flat config + typescript-eslint                          |

---

## Essential Commands

All commands run from the `project/` directory:

```bash
# Development
pnpm dev                  # Start Vite dev server
pnpm build                # TypeScript check + Vite production build
pnpm preview              # Preview production build locally

# Testing
pnpm test                 # Run all tests once (vitest run)
pnpm test:watch           # Watch mode (vitest)
pnpm test -- src/path     # Run specific test file(s)

# Coverage
pnpm test --coverage       # Generate coverage data (single dash; pnpm test -- --coverage breaks flag parsing)
pnpm coverage:report      # Python script: detailed per-file report with threshold checks

# TypeScript & Linting
pnpm typecheck            # tsc -b --noEmit (build-mode typecheck)
pnpm lint                 # ESLint on all files
pnpm check                # lint + typecheck combined
pnpm format               # Prettier across all files

# Git hooks
# Husky runs lint-staged on commit: eslint --fix + typecheck on *.ts/tsx
```

---

## Neon Backend

The backend lives in the sibling `server/` directory (repo root) — a long-running Neon Function exposing a Hono REST API over Lakebase Postgres via Drizzle ORM. Infrastructure is declared in `neon.ts` (repo root): Postgres + Neon Auth + Function. Data flows over REST; the frontend polls via `useApiQuery` instead of Convex's live subscriptions.

### Development

```bash
# From the repo root (pnpm workspace):
pnpm deploy:api            # deploy function (provisions infra on first run)
neon logs query --source function  # tail function logs

pnpm db:generate           # generate SQL migration from server/db/schema.ts
pnpm db:migrate            # apply migrations (uses DATABASE_URL_UNPOOLED)
pnpm --filter genanki-server typecheck
pnpm --filter genanki-server test
```

### Environment Variables (Neon Backend)

Set in `.env.local` (repo root, `--env` file for `neon deploy`) — `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / Neon Auth URLs are injected by Neon and refreshed via `neon env pull`:

| Variable                | Required        | Purpose                                                                                                                                                  |
| ----------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`          | Yes (primary)   | Groq AI provider                                                                                                                                         |
| `CEREBRAS_API_KEY`      | No (fallback)   | Cerebras AI provider                                                                                                                                     |
| `OPENROUTER_API_KEY`    | No (fallback)   | OpenRouter free models                                                                                                                                   |
| `KILO_API_KEY`          | No (fallback)   | Kilo AI provider                                                                                                                                         |
| `KILO_BASE_URL`         | If Kilo enabled | Kilo API base                                                                                                                                            |
| `KILO_MODEL_IDS`        | If Kilo enabled | Comma-separated model IDs                                                                                                                                |
| `CLOUDFLARE_ACCOUNT_ID` | No              | Cloudflare Workers AI account                                                                                                                            |
| `CLOUDFLARE_API_TOKEN`  | No              | Cloudflare Workers AI token                                                                                                                              |
| `CLOUDFLARE_MODEL_IDS`  | No              | Comma-separated Cloudflare model IDs                                                                                                                     |
| `ADMIN_SECRET`          | Yes             | Server-only admin passphrase for the IP admin console. **Never expose via `VITE_*`** — it must only exist in the function env. Use a long random string. |
| `ENCRYPTION_PEPPER`     | Yes             | Pepper for hashing visitor identity (device token + IP). Server-only.                                                                                    |

### Frontend Environment

Client-side env vars go in `project/.env.local`:

```
VITE_API_URL=https://<your-function-host>
```

---

## Project Structure

```
project/
├── src/
│   ├── lib/              # Pure utility functions (unit-tested, in coverage scope)
│   │   ├── anki.ts       # Anki deck/apkg generation
│   │   ├── cardGenerator.ts   # Card text parsing
│   │   ├── deckGeneration.ts  # AI output parsing
│   │   ├── routing.ts        # AI provider scoring/routing
│   │   ├── api.ts        # REST client for the Neon Function (all endpoints)
│   │   ├── docParser.ts      # Document parsing (PDF, DOCX)
│   │   └── ...
│   ├── hooks/            # React hooks (in coverage scope)
│   │   ├── use-api-query.ts  # Polling replacement for convex/react (useApiQuery/useApiMutation)
│   │   ├── use-deck-store.ts
│   │   ├── use-mobile.ts
│   │   └── ...
│   ├── components/       # React components (NOT in coverage scope)
│   │   ├── ui/           # shadcn/ui primitives
│   │   └── ...
│   ├── pages/            # Page components
│   ├── types/            # Shared TypeScript types
│   ├── main.tsx          # App entry point + router
│   ├── index.css         # Global styles + Tailwind
│   └── test-setup.ts     # Vitest setup
├── docs/
│   └── coverage-ignores.md   # Documents all istanbul ignore blocks + coverage strategy
├── scripts/
│   └── coverage-report.py    # Custom per-file coverage checker with thresholds
├── vitest.config.ts      # Test/coverage config + thresholds
├── eslint.config.js      # ESLint flat config
└── package.json          # Dependencies + scripts

# Backend (sibling of project/, repo root):
server/
├── db/schema.ts          # Drizzle Postgres schema (13 tables)
├── services/             # Data services (jobs, usage, rate limits, telemetry, catalog…)
├── deckGeneration.ts     # Main deck generation pipeline
├── providerOrchestrator.ts  # AI provider fallback logic
├── aiProviders.ts        # AI provider API calls
├── app.ts                # Hono REST API (all routes)
├── auth.ts               # Neon Auth JWT verification
├── drizzle/              # Generated SQL migrations
└── tsconfig.json         # Server typecheck config
neon.ts                   # Neon IaC: Postgres + Neon Auth + Function
```

---

## Testing & Coverage Conventions

### Coverage Scope

Only `src/lib/**` and `src/hooks/**` are in coverage scope. Components, pages, UI primitives, and Convex backend are excluded from coverage measurement.

### Thresholds (vitest.config.ts)

```
lines:       99%
functions:   99%
branches:    99%
statements:  99%
```

**Current actual: 100% across all four metrics.** Before raising any threshold, run `pnpm coverage:report` to confirm headroom.

### Writing Tests

- Test files: `*.test.ts` or `*.test.tsx` next to source files
- Import from `vitest`: `describe`, `it`, `expect`, `vi`, `beforeEach`
- React hooks: `renderHook` from `@testing-library/react`
- Use `vi.mock()` for module mocking
- Prefer pure function extraction for testability (see `computeBackoffCooldown`, `mergeFallbackTrail`, `scoreCandidate`)

### Istanbul Ignore Blocks

When a branch genuinely cannot be covered (defensive code, edge-case guards), use:

```ts
/* istanbul ignore start */
// uncovered defensive branch
/* istanbul ignore end */
```

**Never use `/* istanbul ignore next */`** — only `start`/`end` blocks. All ignores must be documented in `docs/coverage-ignores.md`.

---

## Code Conventions

### Import Paths

- Frontend: `@/components/ui/button`, `@/lib/anki`, `@/hooks/use-deck-store`
- Convex: `@/convex/_generated/server`, `@/convex/_generated/api`
- Convex internal: `./encryption`, `./errors` (relative within convex/)

### React Router

- Import from `react-router` (not `react-router-dom`)
- Pages in `src/pages/`, routes defined in `src/main.tsx`

### Styling

- **No hardcoded colors** — use CSS variables via Tailwind classes:
  - `bg-card` not `bg-white`
  - `border-border` not `border-black`
  - `text-foreground` not `text-black`
- Dark mode: always add `dark:` variants
- Use shadcn/ui `nb-border` for neobrutalist borders
- No nested cards, no shadows by default

### Backend Rules

- Data access goes through `server/services/*` — routes in `app.ts` stay thin
- Timestamps cross the REST boundary as epoch milliseconds (numbers), matching the pre-migration API shape; convert to/from `Date` only at the DB layer
- DB schema changes: edit `server/db/schema.ts`, then `drizzle-kit generate` + `drizzle-kit migrate`
- `undefined` vs `null`: route handlers return `c.json(null)` explicitly where the old queries returned `null`
- Rate limiting happens in Postgres transactions (see `services/rateLimits.ts`, `services/ipRateLimiter.ts`)

---

## Deployment Checklist

Before deploying to production:

```bash
# 1. Full test suite with coverage
pnpm test --coverage

# 2. Coverage report — all thresholds must pass
pnpm coverage:report

# 3. Lint + typecheck
pnpm check

# Expected output:
#   - 926+ tests, 0 failures
#   - 100% coverage on statements/branches/functions/lines
#   - 0 files below 97% threshold
#   - 0 ESLint errors, 0 warnings
#   - TypeScript: clean (no errors)

# 4. Deploy Neon backend (from repo root)
pnpm deploy:api            # == neon deploy --env .env.local

# 5. Deploy frontend (Cloudflare Pages)
#    - Production branch: master
#    - Root directory: (blank — repo root; see root wrangler.jsonc)
#    - Build command: pnpm install --frozen-lockfile && pnpm build
#    - Build output: project/dist
#    - VITE_API_URL: set in the Pages env, or rely on the committed
#      project/.env.production default
#    - Or deploy from the CLI: pnpm deploy:web
```

> Any package needing a postinstall must be listed under `allowBuilds` in the
> root `pnpm-workspace.yaml`. pnpm 11 exits non-zero on an unapproved build
> script, which fails the whole Pages build.

> Repo root is a pnpm workspace (`project/` + `server/`). Run `pnpm install`
> once at the root. Pages config lives in the root `wrangler.jsonc` (git build)
> and `project/wrangler.jsonc` (CLI).

---

## Common Agent Workflows

### Adding a New Feature

1. Understand existing code patterns in the relevant directory
2. Write/update tests first (TDD where practical)
3. Implement with pure functions where possible (testability)
4. Run `pnpm test --coverage` — ensure 100% maintained
5. Run `pnpm check` — ensure no lint/type errors
6. Run `pnpm coverage:report` — verify thresholds

### Fixing a Bug

1. Write a failing test reproducing the bug
2. Fix the code
3. Run `pnpm test` — confirm the test now passes
4. Run `pnpm check` — verify no regressions

### Refactoring

1. Extract pure functions for testability
2. Keep files under ~500 lines (see deckGeneration.ts refactor)
3. Re-export for backward compatibility
4. Run full test suite + coverage report

---

## Known Gotchas

- **pnpm, not npm** — the repo root is a pnpm workspace covering `project/` and `server/`. There is no `package-lock.json`; run `pnpm install` from the repo root.
- **esbuild architecture mismatch** — if `pnpm install` fails on ARM/EC2, `@esbuild/darwin-arm64` is pinned explicitly in `project/package.json`; adjust that platform package instead of falling back to npm.
- **Cloudflare token** — `CLOUDFLARE_API_TOKEN` (Workers AI) is a *provider* key for the Function, not the Wrangler deploy token. Wrangler auth uses `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` from the shell or `wrangler login` — don't confuse the two.
- **Coverage scope** — adding new files to `src/lib/` or `src/hooks/` automatically includes them in coverage; they must be tested or the threshold will fail
- **Thresholds are strict** — `vitest.config.ts` thresholds are enforced at test time; any uncovered line/branch fails CI
