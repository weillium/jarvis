#!/usr/bin/env tsx
/**
 * Worker Setup Verification Script
 * Checks if all required environment variables and dependencies are configured
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
];

const optionalEnvVars = [
  'CONTEXT_CHUNKS_MODEL',
  'CONTEXT_BLUEPRINT_MODEL',
  'OPENAI_REALTIME_MODEL',
  'ENRICHMENT_WEB_SEARCH_ENABLED',
  'ENRICHMENT_DOCUMENT_EXTRACTION_ENABLED',
  'ENRICHMENT_WIKIPEDIA_ENABLED',
];

function checkEnvVar(name: string, required: boolean = true): boolean {
  const value = process.env[name];
  if (required && !value) {
    console.error(`❌ Missing required env: ${name}`);
    return false;
  }
  if (value) {
    // Mask sensitive values
    const displayValue = name.includes('KEY') || name.includes('SECRET')
      ? `${value.substring(0, 8)}...`
      : value;
    console.log(`✓ ${name}: ${displayValue}`);
  } else {
    console.log(`○ ${name}: (not set, using default)`);
  }
  return true;
}

async function testSupabaseConnection(): Promise<boolean> {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      console.error('❌ Cannot test Supabase: missing URL or key');
      return false;
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    
    // Test connection
    const { data, error } = await supabase.from('events').select('count').limit(1);
    
    if (error) {
      console.error(`❌ Supabase connection failed: ${error.message}`);
      return false;
    }
    
    console.log('✓ Supabase connection: OK');
    return true;
  } catch (error: any) {
    console.error(`❌ Supabase connection error: ${error.message}`);
    return false;
  }
}

async function testOpenAIConnection(): Promise<boolean> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ Cannot test OpenAI: missing API key');
      return false;
    }

    const openai = new OpenAI({ apiKey });
    
    // Test connection with a simple API call
    const models = await openai.models.list();
    
    if (models.data.length === 0) {
      console.error('❌ OpenAI connection failed: no models returned');
      return false;
    }
    
    console.log('✓ OpenAI connection: OK');
    return true;
  } catch (error: any) {
    console.error(`❌ OpenAI connection error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Worker Setup Verification\n');
  console.log('='.repeat(50));
  
  // Check required env vars
  console.log('\n📋 Required Environment Variables:');
  let allRequired = true;
  for (const envVar of requiredEnvVars) {
    if (!checkEnvVar(envVar, true)) {
      allRequired = false;
    }
  }
  
  // Check optional env vars
  console.log('\n📋 Optional Environment Variables:');
  for (const envVar of optionalEnvVars) {
    checkEnvVar(envVar, false);
  }
  
  if (!allRequired) {
    console.error('\n❌ Setup incomplete: Missing required environment variables');
    console.error('   Create a .env file in the worker/ directory with the required variables.');
    process.exit(1);
  }
  
  // Test connections
  console.log('\n🔌 Testing Connections:');
  console.log('-'.repeat(50));
  
  const supabaseOk = await testSupabaseConnection();
  const openaiOk = await testOpenAIConnection();
  
  console.log('\n' + '='.repeat(50));
  
  if (supabaseOk && openaiOk) {
    console.log('\n✅ All checks passed! Worker is ready to run.');
    console.log('\n   To start the worker:');
    console.log('   cd worker');
    console.log('   npx tsx index.ts');
    process.exit(0);
  } else {
    console.error('\n❌ Some checks failed. Please fix the issues above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

