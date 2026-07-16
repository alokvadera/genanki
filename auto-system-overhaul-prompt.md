# TASK: Overhaul the genanki AI "auto system" (multi-provider generation orchestrator)

You are working in a React 19 + Vite + Convex + TypeScript app. The "auto system" is the
multi-provider AI flashcard generation engine. Improve it across FIVE areas below. Do NOT
add authentication (out of scope). Do NOT break the existing OpenAI-compatible call shape or
the live-progress job streaming. Keep all changes typechecked and tested.

## KEY FILES
- src/convex/deckGeneration.ts   — orchestrator (~1000 lines): entry actions
  generateDeckFromDocument / generateDeckFromPrompt, prioritizeCandidates,
  getCandidateChain, the 3x-duplicated provider fallback loop, chunkText, completion passes.
- src/convex/aiProviders.ts      — provider catalog loaders (groq/cerebras/kilo/openrouter/
  cloudflare), callChatCompletion, ProviderRequestError, RateLimitSnapshot, bounded reads.
- src/convex/rateLimits.ts       — getProviderPolicy, reserveProviderCapacity,
  reportProviderResult, recordPerformance, performanceSnapshot, adaptiveSettings, advisor apply.
- src/convex/providerUsage.ts    — token usage accounting + PROVIDER_PRIORITY.
- src/convex/generationTelemetry.ts, generationJobs.ts, providerAdvisor.ts, providerCatalog.ts,
  availableProviders.ts.
- src/pages/ProviderUsage.tsx, src/pages/AnkiCreator.tsx, src/components/{DocUploadSection,AiDeckBuilder}.tsx
- Provider internal keys: "groq" | "cerebras" | "kilo" | "openrouter" | "cloudflare".
  Cloudflare's display label is "Cloudflare Workers AI" (label != key — handle this everywhere).

## HARD CONSTRAINTS (do not violate)
- Every provider is called via the OpenAI-compatible POST /chat/completions in callChatCompletion.
- The dropdown value equals the internal provider key (e.g. "cloudflare"); preferred provider
  must be TRIED FIRST but other providers remain automatic fallback (NOT strict/exclusive).
- Preserve live job streaming: keep calling generationJobs.update with provider/model/progress/
  eta/partial cards so the UI keeps updating in real time.
- Preserve cancellation and deadline semantics (jobs can be canceled mid-run; a global deadline
  must still abort).
- Do NOT change the flashcard JSON schema { deckName, summary, cards:[{front,back}] } or the
  parseAiDeckGeneration contract.
- After finishing, run `npx tsc -p tsconfig.app.json --noEmit` (must pass) and `npx vitest run`
  (must pass, and you must ADD tests for new pure logic). Deploy is a separate manual step — do
  not deploy.

---

## AREA 1 — REFACTOR FOR MAINTAINABILITY
The provider fallback loop (reserve capacity → update job → callChatCompletion → record
performance → report result → record usage → parse/dedupe → on error switch provider) is
copy-pasted THREE times (document sections, completion passes, prompt generation). Extract ONE
reusable async helper, e.g.:

  async function attemptWithProviderFallback<T>(ctx, {
    candidates, systemPrompt, userContent, maxTokens, kind, jobId, deadlineAt,
    onProgress, parse,           // parse(content) -> T
  }): Promise<{ ok: true; value: T; candidate; usage } | { ok: false; error; attempts }>

Requirements:
- The helper owns: capacity reservation, per-attempt job update, adaptive timeout, the AI call,
  performance recording (success/fail/timeout/latency/tokens), rate-limit reporting (incl. 429
  retry-after -> cooldown), and error classification. Callers only supply prompts + a parse fn.
- Rewrite all three call sites to use it. Behavior must remain equivalent for the happy path.
- Split deckGeneration.ts so the file drops well under ~500 lines: move prompt builders to
  promptBuilder.ts, chunking to a chunker (or keep exported), and the orchestration helper to
  its own module. Keep public action exports (generateDeckFromDocument/Prompt) in place and
  keep currently-exported pure functions exported (tests import them).
- Replace the 4-level nested ternary getAttemptTimeoutMs with a readable switch/lookup (already
  partly done — ensure "cloudflare" has a budget).

EDGE CASES:
- candidates array is empty -> return a typed "no-providers" failure, do not throw raw.
- parse() throws (model returned non-JSON / markdown fences) -> treat as a FAILED attempt for
  that candidate, record a parseFailure telemetry event, and continue to the next candidate
  (don't abort the whole run).
- A candidate whose capacity is not allowed must be skipped WITHOUT counting as a hard failure,
  but must be surfaced in the attempts trail.

## AREA 2 — RELIABILITY & CORRECTNESS
- Cancellation N+1: assertJobActive currently runs a Convex query before every section AND every
  attempt (150+ reads for a 10-chunk x 5-model run). Replace with a single cancellation check
  per section (or a short-TTL cached flag, e.g. re-check at most every ~1.5s), still guaranteeing
  a canceled job stops promptly (within one section/attempt boundary).
- Structured errors: introduce discriminated error types instead of bare Error strings, e.g.
  type GenError = { kind: "canceled" | "timeout" | "rate_limited" | "provider_http" |
  "parse" | "no_providers" | "empty_output" | "deadline"; message; status?; provider?; model? }.
  Map ProviderRequestError, AbortError/timeout, and parse failures onto these. Surface the kind
  in job.error and telemetry.
- Remove silent `catch {}` blocks in aiProviders.ts (catalog loaders): log via console.error with
  structured context and fall back to hardcoded models as today (keep resilience, add visibility).
- Backoff: on 429/503, respect retry-after; if absent use exponential backoff with jitter capped
  by the remaining deadline. Never sleep past deadlineAt.
- Dedupe quality: current key is `${front.toLowerCase().trim()}::${back...}`. Improve to also
  collapse internal whitespace and strip trailing punctuation so near-identical fronts dedupe;
  keep it deterministic and unit-tested. Do NOT drop cards that merely share a back.
- Partial success: if some sections succeed and others fail, still return the collected cards
  with resultPartial=true and warnings; only status "failed" when ZERO cards were produced.
- Deadline: if the global deadline is exceeded mid-run, stop cleanly, return partial cards if any,
  and set a "deadline" warning rather than throwing an opaque error.

EDGE CASES:
- Empty/whitespace-only input -> fast, friendly failure (already partly handled; keep).
- Provider returns 200 but empty content -> classify as empty_output, count as failed attempt,
  continue.
- All providers rate-limited simultaneously -> return no_providers/rate_limited failure with the
  soonest waitSeconds in the message; do not hang.
- Duplicate concurrent runs hitting the same provider -> reservation must prevent exceeding the
  per-minute/day policy (verify reserveProviderCapacity is atomic per provider+model).
- Cloudflare label vs key mismatch must not break routing, reservation, usage, or UI.

## AREA 3 — SMARTER PROVIDER ROUTING
Today ordering is fixed Groq-first, then performanceScore only re-orders WITHIN a provider tier.
Make routing genuinely adaptive across ALL providers while keeping determinism and the
"preferred provider tried first" rule.

- Compute a per-(provider,model) route score from providerPerformance:
  score = w1*successRate  -  w2*normalizedLatency  -  w3*normalizedCost  +  w4*freeTierBonus
  where cost uses a static per-model $ /1k token table (Cloudflare Workers AI, Groq, etc.; add a
  COST_TABLE with sensible defaults and an "unknown -> mid" fallback). freeTierBonus favors
  Cloudflare free tier and openrouter :free models when budget remains (see Area 4).
- Require a minimum sample size (>=3 calls) before trust; below that use a prior (optimistic but
  bounded) so new/free providers still get tried.
- Add hysteresis / circuit-breaker: if a (provider,model) has failed N times in the last window
  or is in cooldown, demote it to the back (do not fully remove — it can recover).
- Respect preferredProvider: its tier is placed FIRST regardless of score; within it, still order
  by score. "auto"/invalid/unconfigured -> pure score order with Groq prior as tiebreak.
- Keep PROVIDER_MODEL_LIMITS (top-N models per provider) but select the top-N BY SCORE.
- Keep the whole thing a PURE, exported, unit-tested function
  prioritizeCandidates(candidates, performance, { preferredProvider, budgets }).

EDGE CASES:
- No performance history at all -> deterministic default order (Groq-first) — must not be random.
- A provider configured but returning zero models -> skipped, providerCount reflects reality.
- Ties -> break by fixed PROVIDER_ORDER then modelId (stable, deterministic; tests depend on it).
- preferredProvider set but that provider has no candidates -> silently fall back to score order.

## AREA 4 — COST / NEURON BUDGET AWARENESS
Cloudflare Workers AI free tier = 10,000 Neurons/day, account-wide, resets 00:00 UTC. Other free
tiers: openrouter :free (~limited req/day). Model the budget so the system avoids blowing free
allocations and can prefer/avoid providers accordingly.

- Add a NEURON_COST table per Cloudflare model (input/output neurons per 1M tokens; use the
  documented values, unknown -> conservative default) and estimate neurons per call from token
  usage (prefer real usage from the response; fall back to char/4 estimate).
- Track a rolling DAILY neuron budget for provider "cloudflare" (account-wide, single counter,
  UTC-day reset) in a Convex table/state. On each successful Cloudflare call, add consumed neurons.
- In reserveProviderCapacity (or a new reserve step), BLOCK Cloudflare when the projected neuron
  spend would exceed the daily free cap (configurable via env CLOUDFLARE_DAILY_NEURON_BUDGET,
  default 10000), returning allowed:false with waitSeconds until UTC midnight.
- Routing (Area 3): while budget remains, give Cloudflare freeTierBonus; when <10% budget left,
  drop the bonus; when exhausted, demote Cloudflare to last (still usable only if others fail AND
  you allow overflow — default: do not overflow the free cap).
- Surface budget in the UI ProviderUsage page: show "Cloudflare Workers AI — X / 10,000 Neurons
  used today (resets in Hh Mm)".

EDGE CASES:
- UTC day rollover mid-run -> counter resets correctly (window keyed to UTC day start).
- Real usage tokens missing from a provider response -> fall back to estimate; never NaN.
- Budget env unset -> default 10000; env malformed -> clamp to a safe positive integer.
- Concurrent Cloudflare calls -> budget reservation must be atomic (reserve projected neurons
  before the call, reconcile with actual after; refund the difference if the call fails).
- Never let budget logic throw and abort a run — on any budget error, log and treat Cloudflare as
  unavailable, continue with other providers.

## AREA 5 — OBSERVABILITY
- Add structured console logging (single-line JSON-ish objects) at key points: run start
  (kind, requestedCount, providerCount), each attempt (provider, model, outcome, latencyMs,
  status, neurons), fallbacks (from->to, reason), run end (generated/requested, partial, warnings).
  Include jobId in every log for correlation. No secrets in logs (never log API keys/tokens).
- Extend generationTelemetry to record per-ATTEMPT rows (event: "attempt", provider, model,
  outcome kind, latencyMs, tokens, neurons) in addition to the existing summary events, without
  breaking the existing summary() query. Guard table growth (see below).
- Build a "fallback trail" for each job: an ordered array of {provider, model, outcome, reason}
  stored on the job (new optional field) or queryable via telemetry byJob, and render it in the
  UI (AnkiCreator live status and/or ArchivedRunViewer) so the user can see WHY it fell back.
- ProviderUsage.tsx: ensure Cloudflare appears in every provider list (it uses label
  "Cloudflare Workers AI" but key "cloudflare" — map correctly), show route score and last outcome.

EDGE CASES:
- Telemetry/usage tables are append-only and unbounded -> add a scheduled cleanup (or capped
  insert) deleting rows older than 30 days so .collect() queries don't degrade. Make it safe to
  run repeatedly.
- Logging must be cheap and must never throw (wrap in try/catch, swallow logging errors only).
- UI must handle undefined/loading query states (show skeletons, not "none") and empty trails.

---

## SCHEMA / MIGRATION NOTES
- If you add tables (e.g. cloudflareNeuronBudget, per-attempt telemetry) or job fields
  (fallbackTrail), update src/convex/schema.ts with proper indexes (by_provider_model,
  by_createdAt, by_jobId_createdAt as needed). All new fields must be v.optional to avoid
  breaking existing rows. Do not enable/disable schemaValidation as part of this task.

## DELIVERABLES / DEFINITION OF DONE
1. `npx tsc -p tsconfig.app.json --noEmit` passes.
2. `npx vitest run` passes, INCLUDING new unit tests for: attemptWithProviderFallback error
   classification, prioritizeCandidates scoring/hysteresis/preferred/ties, dedupe normalization,
   neuron estimation + budget reservation/rollover, and cost-table fallback.
3. Manual sanity: with only CLOUDFLARE creds set, a run routes to Cloudflare and streams cards;
   selecting a provider in the dropdown tries it first; forcing a provider failure falls back and
   the fallback trail shows the reason.
4. No regression to job streaming, cancellation, deadlines, or the flashcard JSON schema.
5. Provide a concise summary of: files changed, new modules, new tables/fields, new env vars
   (CLOUDFLARE_DAILY_NEURON_BUDGET), and any follow-ups you intentionally deferred.

## WORKING METHOD
- Implement in this order: Area 1 (refactor) → 2 (reliability) → 3 (routing) → 4 (budget) →
  5 (observability). Typecheck + run tests after EACH area; keep commits/steps small.
- Prefer pure, exported, testable functions for all decision logic (scoring, dedupe, neuron math,
  budget) so they can be unit-tested without Convex.
- Do not introduce new heavy dependencies. Match existing code style. Keep diffs focused.
