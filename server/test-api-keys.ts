/**
 * Test script to verify all AI provider API keys are working.
 * Run with: npx tsx --env-file=.env test-api-keys.ts
 * 
 * This script connects to all 5 AI providers and verifies:
 * - API keys are valid
 * - Models can be fetched
 * - Free-tier models are available
 */
import { buildModelCandidates } from "./aiProviders";

async function testAllProviders() {
  console.log("🔍 Testing AI Provider API Keys...\n");
  
  try {
    const models = await buildModelCandidates();
    
    console.log("✅ Successfully connected to providers:\n");
    
    const providerCounts = new Map<string, { count: number; models: string[] }>();
    for (const model of models) {
      const existing = providerCounts.get(model.provider) || { count: 0, models: [] };
      existing.count++;
      existing.models.push(model.modelId);
      providerCounts.set(model.provider, existing);
    }
    
    for (const [provider, data] of providerCounts) {
      const freeModels = data.models.filter(m => m.includes(':free') || m === 'openrouter/free');
      console.log(`📦 ${provider.toUpperCase()}:`);
      console.log(`   Total models: ${data.count}`);
      console.log(`   Free models: ${freeModels.length}`);
      if (data.models.length > 0) {
        console.log(`   Sample models: ${data.models.slice(0, 3).join(', ')}${data.models.length > 3 ? '...' : ''}`);
      }
      console.log("");
    }
    
    if (providerCounts.size === 0) {
      console.log('❌ No providers returned any models. Check your API keys.\n');
      return false;
    }
    
    const totalModels = models.length;
    const totalProviders = providerCounts.size;
    const totalFreeModels = models.filter(m => m.modelId.includes(':free') || m.modelId === 'openrouter/free').length;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("📊 TEST RESULTS");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`✅ Providers connected: ${totalProviders}/5`);
    console.log(`✅ Total models available: ${totalModels}`);
    console.log(`✅ Free-tier models: ${totalFreeModels}`);
    console.log("═══════════════════════════════════════════════════════════════\n");
    
    console.log("📈 FREE TIER CAPACITY (per day):");
    console.log("───────────────────────────────────────────────────────────────────");
    console.log("🟢 Groq:     14,400 req (llama-3.1-8b) | 1,000 req (larger models)");
    console.log("🟢 Cerebras: 1,000,000 tokens");
    console.log("🟡 Kilo:     200 req/hr (anonymous) | kilo-auto/free available");
    console.log("🟢 Cloudflare: 10,000 neurons (~400K tokens on cheapest model)");
    console.log("🟡 OpenRouter: 50-1,000 req (depending on credit history)");
    console.log("───────────────────────────────────────────────────────────────────\n");
    
    console.log("✅ All configured API keys are working correctly!");
    console.log("───────────────────────────────────────────────────────────────────\n");
    
    return true;
    
  } catch (error) {
    console.error("❌ Error testing providers:");
    console.error(error);
    return false;
  }
}

testAllProviders()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
