/**
 * Quick Test Script for Step 2: Node Orchestrator Service
 * 
 * This script verifies that all Step 2 components are properly implemented
 * and can be instantiated without errors.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { RingBuffer } from './ring-buffer';
import { FactsStore } from './facts-store';
import { RealtimeSession } from './realtime-session';
import { Orchestrator, OrchestratorConfig } from './orchestrator';
import { buildTopicContext } from './context-builder';

function log(...args: any[]) {
  console.log(`[TEST] ${new Date().toISOString()}`, ...args);
}

async function testStep2() {
  log('Starting Step 2 verification tests...\n');

  // Check environment variables
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`[ERROR] Missing environment variables: ${missing.join(', ')}`);
    console.error('Create a .env file in worker/ directory with these variables.');
    process.exit(1);
  }

  log('✓ Environment variables present');

  // Initialize clients
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  log('✓ Supabase and OpenAI clients initialized\n');

  // Test 1: Ring Buffer
  log('Test 1: Ring Buffer');
  try {
    const ringBuffer = new RingBuffer(100, 60000);
    ringBuffer.add({
      seq: 1,
      at_ms: Date.now(),
      text: 'Test transcript',
      final: true,
    });
    const stats = ringBuffer.getStats();
    log(`✓ Ring Buffer working - ${stats.total} chunks, ${stats.finalized} finalized`);
  } catch (error: any) {
    log(`✗ Ring Buffer failed: ${error.message}`);
    return false;
  }

  // Test 2: Facts Store
  log('\nTest 2: Facts Store');
  try {
    const factsStore = new FactsStore();
    factsStore.upsert('test_key', 'test_value', 0.8, 1);
    const facts = factsStore.getAll();
    log(`✓ Facts Store working - ${facts.length} facts stored`);
  } catch (error: any) {
    log(`✗ Facts Store failed: ${error.message}`);
    return false;
  }

  // Test 3: Realtime Session (instantiation only, not connection)
  log('\nTest 3: Realtime Session');
  try {
    const session = new RealtimeSession(openai, {
      eventId: 'test-event-id',
      agentType: 'cards',
    });
    log(`✓ Realtime Session instantiated - name: ${session.name || 'N/A'}`);
  } catch (error: any) {
    log(`✗ Realtime Session failed: ${error.message}`);
    return false;
  }

  // Test 4: Orchestrator (instantiation and initialization)
  log('\nTest 4: Orchestrator');
  try {
    const config: OrchestratorConfig = {
      supabase,
      openai,
      embedModel: process.env.EMBED_MODEL || 'text-embedding-3-small',
      genModel: process.env.GEN_MODEL || 'gpt-4o-mini',
      realtimeModel: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01',
    };
    const orchestrator = new Orchestrator(config);
    log(`✓ Orchestrator instantiated`);
    
    // Test initialization (will subscribe to Realtime)
    log('  Initializing orchestrator (may take a moment)...');
    await orchestrator.initialize();
    log(`✓ Orchestrator initialized and subscribed to transcript events`);
    
    // Cleanup
    await orchestrator.shutdown();
    log(`✓ Orchestrator shutdown gracefully`);
  } catch (error: any) {
    log(`✗ Orchestrator failed: ${error.message}`);
    console.error(error);
    return false;
  }

  // Test 5: Context Builder (verify it can be called)
  log('\nTest 5: Context Builder');
  try {
    // Just verify the function exists and signature is correct
    const hasBuildTopicContext = typeof buildTopicContext === 'function';
    log(`✓ Context Builder function available: ${hasBuildTopicContext}`);
    
    // Note: We don't actually call it here to avoid creating test data
    log('  (Skipping actual context build to avoid creating test data)');
  } catch (error: any) {
    log(`✗ Context Builder failed: ${error.message}`);
    return false;
  }

  log('\n✅ All Step 2 components verified successfully!');
  log('\nNext steps for full testing:');
  log('1. Create an event via Edge Function or directly in database');
  log('2. Create an agent with status="prepping" for that event');
  log('3. Run the worker: cd worker && npx tsx index.ts');
  log('4. Watch logs to see prep phase and context generation');
  log('5. Insert a transcript and verify it gets processed');
  
  return true;
}

// Run tests
testStep2()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('[FATAL]', error);
    process.exit(1);
  });

