# Rate Limiting Configuration

This project implements rate limiting to stay within free tier limits across all AI providers.

## 📊 Current Rate Limits

| Provider | RPM | TPM | RPD | Notes |
|----------|-----|-----|-----|-------|
| **Groq** | 25-50 | 5,000-25,000 | 1,000-14,000 | Varies by model |
| **Cerebras** | 5 | 30,000 | 1,000 | 1M tokens/day total |
| **Kilo** | 3 | 20,000 | 50 | Free tier limited |
| **Cloudflare** | 30 | 25,000 | 60 | 10,000 neurons/day |
| **OpenRouter** | 15 | 20,000 | 50 | Free tier (can increase with credits) |

## 🔧 How It Works

### Reservation System
When a generation request starts:
1. `reserveProviderCapacity()` is called with estimated token count
2. Checks per-minute, per-day, and Cloudflare neuron budgets
3. Returns `{ allowed: true }` or `{ allowed: false, waitSeconds: N }`
4. If allowed, decrements the available capacity atomically

### Reporting Results
After generation completes:
1. `reportProviderResult()` is called with actual usage
2. Updates rate limit state with real remaining counts
3. For Cloudflare: reconciles neuron budget (refunds over-projection)

### Adaptive Routing
The routing system (`lib/routing.ts`) prioritizes:
1. Free-tier models first (cost = 0)
2. Models with better success rates
3. Models with lower latency
4. Circuit breaker: penalizes models with >50% failure rate

## 🎯 Free Tier Optimization

### Model Priority Order
1. **Groq llama-3.1-8b** - 14,400 req/day (highest volume)
2. **Cerebras** - 1M tokens/day (highest token count)
3. **OpenRouter free models** - 50-1,000 req/day
4. **Cloudflare** - 10,000 neurons/day (~400K tokens)
5. **Kilo free models** - 200 req/hr

### Cost Table
All configured models are marked as free (cost = 0) in the routing system:
- Groq: All models on free tier
- Cerebras: All models free during beta
- Cloudflare: All within daily neuron budget
- OpenRouter: :free suffix models
- Kilo: kilo-auto/free and :free models

## 📈 Monitoring

### Endpoints
- `GET /api/rate-limits/states` - Current rate limit state for all providers
- `GET /api/rate-limits/cloudflare-budget` - Cloudflare neuron budget usage
- `GET /api/providers/catalog` - Available models per provider

### Database Tables
- `provider_rate_state` - Per-provider/per-model rate limit tracking
- `cloudflare_neuron_budget` - Daily neuron budget tracking
- `provider_performance` - Success rates and latency per model

## ⚠️ Important Notes

1. **Rate limits reset at different times:**
   - Per-minute: Every 60 seconds
   - Per-day: midnight UTC (Cloudflare, Cerebras, OpenRouter)
   
2. **Cloudflare neuron budget:**
   - Shared across all models
   - Refunded if actual usage < projected
   - 80% exhaustion triggers warning

3. **OpenRouter free tier:**
   - 50 req/day without credits
   - 1,000 req/day with $10+ lifetime credits
   - Consider purchasing $10 credits for 20x capacity increase

4. **Kilo Gateway:**
   - Free tier is rate-limited
   - kilo-auto/free provides automatic routing to best free model
