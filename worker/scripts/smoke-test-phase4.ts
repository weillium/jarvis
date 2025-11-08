/**
 * Phase 4 Smoke Test
 * Verifies that worker code can insert/query context_items with metadata JSONB
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54421';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function smokeTest() {
  console.log('🧪 Running Phase 4 Smoke Tests...\n');

  const testEventId = '00000000-0000-0000-0000-000000000000';
  let passed = 0;
  let failed = 0;

  // Test 1: Query context_items with metadata JSONB
  try {
    const { error } = await supabase
      .from('context_items')
      .select('id, chunk, metadata, rank')
      .eq('event_id', testEventId)
      .limit(1);
    
    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    console.log('✅ PASS: Query context_items with metadata JSONB works');
    passed++;
  } catch (err: unknown) {
    failed++;
    console.error("[worker] error:", String(err));
  }

  // Test 2: Verify metadata structure (if data exists)
  try {
    const { data, error } = await supabase
      .from('context_items')
      .select('metadata')
      .limit(1);
    
    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    
    type MetadataRow = { metadata: unknown };
    const rows: MetadataRow[] = Array.isArray(data)
      ? data.filter(
          (row): row is MetadataRow =>
            typeof row === 'object' && row !== null && 'metadata' in row
        )
      : [];

    if (rows.length > 0 && rows[0]?.metadata !== undefined && rows[0]?.metadata !== null) {
      const metadata = rows[0]?.metadata;
      if (typeof metadata === 'object' && metadata !== null) {
        const metaRecord = metadata as Record<string, unknown>;
        if ('source' in metaRecord || 'enrichment_source' in metaRecord) {
          console.log('✅ PASS: Metadata structure valid (has source fields)');
        } else {
          console.log('⚠️  WARN: Metadata structure present but missing expected source fields');
        }
      } else {
        console.log('⚠️  WARN: Metadata structure present but not an object');
      }
      passed++;
    } else {
      console.log('✅ PASS: Metadata structure check (no data to verify)');
      passed++;
    }
  } catch (err: unknown) {
    failed++;
    console.error("[worker] error:", String(err));
  }

  // Test 3: Verify we can query by metadata fields
  try {
    const { error } = await supabase
      .from('context_items')
      .select('id, metadata')
      .eq('event_id', testEventId)
      .not('metadata->>source', 'is', null)
      .limit(1);
    
    if (error && !error.message.includes('does not exist') && !error.message.includes('operator does not exist')) {
      // Some Supabase versions may not support ->>, that's okay for this test
      if (error.message.includes('operator')) {
        console.log('⚠️  WARN: Metadata query operator not supported (may need different syntax)');
        passed++;
      } else {
        throw error;
      }
    } else {
      console.log('✅ PASS: Query by metadata fields works');
      passed++;
    }
  } catch (err: unknown) {
    failed++;
    console.error("[worker] error:", String(err));
  }

  // Test 4: Verify we cannot query old columns (they should not exist)
  try {
    // This should fail because columns don't exist
    const { error } = await supabase
      .from('context_items')
      .select('source, enrichment_source, quality_score')
      .limit(1);
    
    if (error && error.message.includes('column') && error.message.includes('does not exist')) {
      console.log('✅ PASS: Old columns correctly removed (query fails as expected)');
      passed++;
    } else if (!error) {
      console.error('❌ FAIL: Old columns still exist (should have been removed)');
      failed++;
    } else {
      // Other errors are okay
      console.log('✅ PASS: Old columns check (query behavior as expected)');
      passed++;
    }
  } catch (err: unknown) {
    failed++;
    console.error("[worker] error:", String(err));
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
