# AGENTS.md — Genanki Codebase Guide for AI Agents

> **Purpose:** Every AI agent that works on this codebase should read this file first. It contains all commands, conventions, and procedures needed to work effectively without breaking anything.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind v4, shadcn/ui, Framer Motion |
| Routing | React Router v7 (`react-router`, not `react-router-dom`) |
| Backend | Convex (realtime DB + serverless functions) |
| Auth | Convex Auth (backend-only; frontend auth is removed) |
| AI | Groq (primary), Cerebras, OpenRouter, Kilo, Cloudflare Workers AI |
| Package Manager | **pnpm** (not npm) |
| Testing | Vitest + @testing-library/react |
| Coverage | Istanbul (via @vitest/coverage-istanbul) |
| Linting | ESLint 9 flat config + typescript-eslint |

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
pnpm test -- --coverage   # Generate coverage data
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

## Convex Backend

### Development

```bash
npx convex dev              # Start Convex dev deployment (watches files, pushes code, generates types)
npx convex dashboard        # Open Convex dashboard in browser
```

Convex config: `convex.json` — functions live in `src/convex/`. The generated files are at `src/convex/_generated/` (auto-generated; never edit manually).

### Deployment to Production

```bash
# Push backend changes to production
npx convex deploy

# Deploy with specific env vars (set them in Convex dashboard or via CLI)
npx convex env set GROQ_API_KEY "gsk_xxx"
npx convex env set CEREBRAS_API_KEY "csk_xxx"
```

**Important:** `npx convex deploy` pushes your Convex functions to the production deployment. Do this after `pnpm test` passes with 100% coverage. Frontend is deployed separately (Cloudflare Pages, see below).

### Environment Variables (Convex Backend)

Set via `npx convex env set KEY value` or the Convex dashboard:

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | Yes (primary) | Groq AI provider |
| `CEREBRAS_API_KEY` | No (fallback) | Cerebras AI provider |
| `OPENROUTER_API_KEY` | No (fallback) | OpenRouter free models |
| `KILO_API_KEY` | No (fallback) | Kilo AI provider |
| `KILO_BASE_URL` | If Kilo enabled | Kilo API base |
| `KILO_MODEL_IDS` | If Kilo enabled | Comma-separated model IDs |
| `CLOUDFLARE_ACCOUNT_ID` | No | Cloudflare Workers AI account |
| `CLOUDFLARE_API_TOKEN` | No | Cloudflare Workers AI token |
| `CLOUDFLARE_MODEL_IDS` | No | Comma-separated model IDs |
| `VLY_CONVEX_AUTH_ISSUER` | Yes | Auth issuer URL (`.convex.site` URL) |

### Frontend Environment

Client-side env vars go in `.env.local`:

```
VITE_CONVEX_URL=https://your-project.convex.cloud
```

---

## Project Structure

```
project/
├── src/
│   ├── convex/           # Convex backend (schema, mutations, actions, queries)
│   │   ├── _generated/   # Auto-generated Convex types (DO NOT EDIT)
│   │   ├── schema.ts     # Database schema
│   │   ├── auth.ts       # Auth configuration
│   │   ├── deckGeneration.ts  # Main deck generation actions
│   │   ├── deckHelpers.ts     # Extracted helper functions
│   │   ├── deckChunking.ts    # Text chunking utilities
│   │   ├── providerOrchestrator.ts  # AI provider fallback logic
│   │   ├── aiProviders.ts     # AI provider API calls
│   │   ├── logger.ts          # Structured JSON logger
│   │   └── ...
│   ├── lib/              # Pure utility functions (unit-tested, in coverage scope)
│   │   ├── anki.ts       # Anki deck/apkg generation
│   │   ├── cardGenerator.ts   # Card text parsing
│   │   ├── deckGeneration.ts  # AI output parsing
│   │   ├── routing.ts        # AI provider scoring/routing
│   │   ├── docParser.ts      # Document parsing (PDF, DOCX)
│   │   └── ...
│   ├── hooks/            # React hooks (in coverage scope)
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
├── convex.json           # Convex project config
└── package.json          # Dependencies + scripts
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

### Convex Rules

- Actions (`"use node"`) cannot have queries/mutations in the same file
- Document IDs: `_id` field, `Id<"TableName">` type, `Doc<"TableName">` object type
- Keep `schemaValidation: false` in schema
- No return type validators
- Always handle `null | undefined` from queries

---

## Deployment Checklist

Before deploying to production:

```bash
# 1. Full test suite with coverage
pnpm test -- --coverage

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

# 4. Deploy Convex backend
npx convex deploy

# 5. Deploy frontend (Cloudflare Pages)
#    - Connect repo to Cloudflare Pages
#    - Build command: pnpm build
#    - Build output: dist/
#    - Set VITE_CONVEX_URL in Cloudflare Pages env vars
```

---

## Common Agent Workflows

### Adding a New Feature

1. Understand existing code patterns in the relevant directory
2. Write/update tests first (TDD where practical)
3. Implement with pure functions where possible (testability)
4. Run `pnpm test -- --coverage` — ensure 100% maintained
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

- **pnpm, not npm** — `npm install` will not respect `pnpm-workspace.yaml`
- **esbuild architecture mismatch** — if `pnpm install` fails on ARM/EC2, use `npm install --force` as fallback (deps are pre-installed)
- **Convex generated files** — never edit `src/convex/_generated/`; these are auto-generated by `npx convex dev` or `npx convex deploy`
- **Coverage scope** — adding new files to `src/lib/` or `src/hooks/` automatically includes them in coverage; they must be tested or the threshold will fail
- **Thresholds are strict** — `vitest.config.ts` thresholds are enforced at test time; any uncovered line/branch fails CI
