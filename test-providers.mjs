import { buildModelCandidates } from './server/aiProviders.ts';

async function testProviders() {
  console.log('🔍 Testing AI Provider API Keys...\n');
  
  try {
    const models = await buildModelCandidates();
    
    console.log('✅ Successfully loaded models from providers:\n');
    
    const providerCounts = new Map();
    for (const model of models) {
      const count = providerCounts.get(model.provider) || 0;
      providerCounts.set(model.provider, count + 1);
    }
    
    for (const [provider, count] of providerCounts) {
      console.log(`  ✅ ${provider}: ${count} models loaded`);
    }
    
    if (providerCounts.size === 0) {
      console.log('❌ No providers returned any models. Check your API keys.\n');
      process.exit(1);
    }
    
    console.log(`\n✅ Total: ${models.length} models across ${providerCounts.size} providers`);
    
  } catch (error) {
    console.error('❌ Error testing providers:', error.message);
    process.exit(1);
  }
}

testProviders();
