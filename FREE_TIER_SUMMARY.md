# Free Tier Summary - All AI Providers

## 🟢 Groq (FREE - No credit card required)

**Base URL:** `https://api.groq.com/openai/v1`

### Free Tier Limits (2026):
| Model | RPM | RPD | TPM | TPD |
|-------|-----|-----|-----|-----|
| llama-3.1-8b-instant | 30 | 14,400 | 6,000 | 500,000 |
| llama-3.3-70b-versatile | 30 | 1,000 | 12,000 | 100,000 |
| meta-llama/llama-4-scout-17b-16e-instruct | 30 | 1,000 | 30,000 | 500,000 |
| qwen/qwen3-32b | 60 | 1,000 | 6,000 | 500,000 |
| openai/gpt-oss-20b | 30 | 1,000 | 8,000 | 200,000 |
| openai/gpt-oss-120b | 30 | 1,000 | 8,000 | 200,000 |

**Best for:** High-volume prototyping with llama-3.1-8b-instant (14,400 req/day!)

---

## 🟢 Cerebras (FREE - No credit card required)

**Base URL:** `https://api.cerebras.ai/v1`

### Free Tier Limits (2026):
- **1,000,000 tokens/day** (resets daily, no expiry)
- ~5 req/min, 30K tokens/min
- 8,192 token context cap on free tier
- Models: gpt-oss-120b, zai-glm-4.7 (lineup rotates)

**Best for:** High token volume with ultra-fast inference (2,600+ tokens/sec)

---

## 🟡 Kilo Gateway (FREE tier available)

**Base URL:** `https://api.kilo.ai/api/gateway`

### Free Tier:
- **Free tier: $0/forever** - Perfect for getting started
- Free models available (no credits required):
  - `stepfun/step-3.7-flash:free`
  - `poolside/laguna-s-2.1:free`
  - `poolside/laguna-xs-2.1:free`
  - `nvidia/nemotron-3-ultra-550b-a55b:free`
  - `tencent/hy3:free`
  - `openrouter/free`
- Anonymous users: 200 requests/hour per IP
- Auto models: `kilo-auto/free` (routes to best free model)

**Best for:** Access to 366+ models through one API, including free options

---

## 🟢 Cloudflare Workers AI (FREE - No credit card required)

**Base URL:** `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1`

### Free Tier Limits (2026):
- **10,000 Neurons/day** (resets daily at 00:00 UTC)
- 300 requests/min text-generation cap
- No credit card required

### Model Neuron Costs:
| Model | Neurons per 1K tokens |
|-------|----------------------|
| @cf/meta/llama-3.2-3b-instruct | 25 |
| @cf/qwen/qwen3-30b-a3b-fp8 | 50 |
| @cf/meta/llama-3.1-8b-instruct-fp8-fast | 25 |

**Best for:** Edge inference, completely free daily allowance

---

## 🟡 OpenRouter (FREE tier + paid models)

**Base URL:** `https://openrouter.ai/api/v1`

### Free Tier Limits (2026):
- **20 requests/minute** on all `:free` models
- **50 free-model requests/day** if you've never purchased credits
- **1,000 free-model requests/day** if you've purchased $10+ lifetime credits
- No credit card required for free tier

### Popular Free Models (July 2026):
| Model | Context | Best For |
|-------|---------|----------|
| nvidia/nemotron-3-ultra-550b-a55b:free | 1M | Long-horizon agents |
| poolside/laguna-m.1:free | 262K | Agentic coding |
| openai/gpt-oss-120b:free | 131K | General reasoning |
| cohere/north-mini-code:free | 256K | Code generation |
| meta-llama/llama-3.3-70b-instruct:free | 131K | Multilingual chat |
| qwen/qwen3-next-80b-a3b-instruct:free | 262K | RAG, tool use |

**Pro tip:** Use `openrouter/free` as the model ID to auto-route to best available free model.

**Best for:** Access to 500+ models, free tier with auto-routing

---

## 🎯 Recommended Free-Only Configuration

For a completely free setup (no credit card, no paid credits):

```
GROQ_API_KEY=...
CEREBRAS_API_KEY=...
KILO_API_KEY=...
KILO_BASE_URL=https://api.kilo.ai/api/gateway
KILO_MODEL_IDS=kilo-auto/free,openrouter/free
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
OPENROUTER_API_KEY=...
OPENROUTER_APP_NAME=...
```

This gives you:
- **Groq:** 14,400+ requests/day on llama-3.1-8b
- **Cerebras:** 1M tokens/day
- **Kilo:** Access to free models + auto-routing
- **Cloudflare:** 10,000 neurons/day
- **OpenRouter:** 50-1,000 free requests/day
