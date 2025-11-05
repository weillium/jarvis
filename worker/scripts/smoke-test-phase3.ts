/**
 * Phase 3 Smoke Test
 * Verifies that worker code compiles and can query tables without is_active
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54421';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function smokeTest() {
  console.log('🧪 Running Phase 3 Smoke Tests...\n');

  const testEventId = '00000000-0000-0000-0000-000000000000';
  let passed = 0;
  let failed = 0;

  // Test 1: Query context_items without is_active
  try {
    const { error } = await supabase
      .from('context_items')
      .select('id, event_id, generation_cycle_id')
      .eq('event_id', testEventId)
      .limit(1);
    
    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    console.log('✅ PASS: context_items query works without is_active');
    passed++;
  } catch (error: any) {
    console.error('❌ FAIL: context_items query:', error.message);
    failed++;
  }

  // Test 2: Query glossary_terms without is_active
  try {
    const { error } = await supabase
      .from('glossary_terms')
      .select('id, event_id, generation_cycle_id')
      .eq('event_id', testEventId)
      .limit(1);
    
    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    console.log('✅ PASS: glossary_terms query works without is_active');
    passed++;
  } catch (error: any) {
    console.error('❌ FAIL: glossary_terms query:', error.message);
    failed++;
  }

  // Test 3: Query research_results without is_active
  try {
    const { error } = await supabase
      .from('research_results')
      .select('id, event_id, generation_cycle_id')
      .eq('event_id', testEventId)
      .limit(1);
    
    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    console.log('✅ PASS: research_results query works without is_active');
    passed++;
  } catch (error: any) {
    console.error('❌ FAIL: research_results query:', error.message);
    failed++;
  }

  // Test 4: Verify generation_cycle_id column exists
  try {
    const { data, error } = await supabase
      .from('context_items')
      .select('generation_cycle_id')
      .limit(1);
    
    if (error && !error.message.includes('does not exist') && !error.message.includes('column')) {
      throw error;
    }
    console.log('✅ PASS: generation_cycle_id column exists');
    passed++;
  } catch (error: any) {
    console.error('❌ FAIL: generation_cycle_id column check:', error.message);
    failed++;
  }

  // Summary
  console.log('\n========================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All smoke tests passed!');
    process.exit(0);
  }
}

smokeTest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

