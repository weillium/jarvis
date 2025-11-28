#!/usr/bin/env tsx

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

const DEFAULT_EVENT_ID = 'aebded42-db5c-42eb-ba8d-9ca5ee15671e';
const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:54421';
const DEFAULT_SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

interface CardPayload {
  title?: string;
  label?: string;
  body?: string;
  card_type?: 'text' | 'text_visual' | 'visual';
  visual_request?: {
    strategy?: 'fetch' | 'generate';
    instructions?: string;
    source_url?: string | null;
  } | null;
  image_url?: string | null;
}

interface CardRow {
  event_id: string;
  card_id: string;
  card_type: string | null;
  payload: CardPayload;
  created_at: string;
}

async function main(): Promise<void> {
  const eventId = process.argv[2] ?? process.env.EVENT_ID ?? DEFAULT_EVENT_ID;

  const supabaseUrl = process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  console.log(`\n🔍 Analyzing visuals for event: ${eventId}\n`);

  const { data: cards, error } = await supabase
    .from('cards')
    .select('event_id, card_id, card_type, payload, created_at')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[analyze-visuals] error:', String(error));
    process.exit(1);
  }

  const cardRows = (cards ?? []) as CardRow[];

  if (cardRows.length === 0) {
    console.log('No cards found for this event.\n');
    return;
  }

  // Analyze visual requests
  const visualRequests: Array<{
    cardId: string;
    title: string;
    cardType: string;
    strategy: string;
    instructions: string;
    hasImageUrl: boolean;
    imageUrl: string | null;
    status: 'success' | 'failed' | 'pending';
  }> = [];

  for (const card of cardRows) {
    const payload = card.payload as CardPayload;
    const cardType = card.card_type ?? payload.card_type ?? 'text';
    const visualRequest = payload.visual_request;

    // Check if this card should have a visual
    if (cardType === 'visual' || cardType === 'text_visual') {
      const title = payload.title ?? payload.label ?? 'Untitled';
      const strategy = visualRequest?.strategy ?? 'unknown';
      const instructions = visualRequest?.instructions ?? 'No instructions';
      const imageUrl = payload.image_url ?? null;
      const hasImageUrl = imageUrl !== null && imageUrl.trim().length > 0;

      let status: 'success' | 'failed' | 'pending';
      if (hasImageUrl) {
        status = 'success';
      } else if (visualRequest) {
        status = 'failed';
      } else {
        status = 'pending';
      }

      visualRequests.push({
        cardId: card.card_id,
        title,
        cardType,
        strategy,
        instructions,
        hasImageUrl,
        imageUrl,
        status,
      });
    }
  }

  // Print summary
  console.log('='.repeat(80));
  console.log('VISUAL REQUEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal cards: ${cardRows.length}`);
  console.log(`Cards with visual requests: ${visualRequests.length}`);
  console.log(`Successfully generated: ${visualRequests.filter((v) => v.status === 'success').length}`);
  console.log(`Failed: ${visualRequests.filter((v) => v.status === 'failed').length}`);
  console.log(`Pending: ${visualRequests.filter((v) => v.status === 'pending').length}`);

  if (visualRequests.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('DETAILED VISUAL REQUESTS');
    console.log('='.repeat(80));

    for (let i = 0; i < visualRequests.length; i++) {
      const v = visualRequests[i];
      const statusIcon = v.status === 'success' ? '✅' : v.status === 'failed' ? '❌' : '⏳';
      
      console.log(`\n${i + 1}. ${statusIcon} ${v.title}`);
      console.log(`   Card Type: ${v.cardType}`);
      console.log(`   Strategy: ${v.strategy}`);
      console.log(`   Instructions: ${v.instructions.substring(0, 100)}${v.instructions.length > 100 ? '...' : ''}`);
      console.log(`   Status: ${v.status.toUpperCase()}`);
      if (v.hasImageUrl && v.imageUrl) {
        console.log(`   Image URL: ${v.imageUrl}`);
      } else {
        console.log(`   Image URL: (not resolved)`);
      }
      console.log(`   Card ID: ${v.cardId}`);
    }
  }

  // Also check for cards that were downgraded (should have been visual but aren't)
  const downgradedCards: Array<{
    cardId: string;
    title: string;
    currentType: string;
    reason: string;
  }> = [];

  for (const card of cardRows) {
    const payload = card.payload as CardPayload;
    const cardType = card.card_type ?? payload.card_type ?? 'text';
    
    // Cards that are text but might have had visual_request originally
    // (we can't tell for sure, but we can note cards that are text with no body but have a label)
    if (cardType === 'text' && !payload.body && payload.label) {
      downgradedCards.push({
        cardId: card.card_id,
        title: payload.title ?? payload.label ?? 'Untitled',
        currentType: cardType,
        reason: 'Possible downgrade: text card with label but no body',
      });
    }
  }

  if (downgradedCards.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('POSSIBLY DOWNGRADED CARDS');
    console.log('='.repeat(80));
    for (const d of downgradedCards) {
      console.log(`\n⚠️  ${d.title}`);
      console.log(`   Current Type: ${d.currentType}`);
      console.log(`   Reason: ${d.reason}`);
      console.log(`   Card ID: ${d.cardId}`);
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

main().catch((err: unknown) => {
  console.error('[analyze-visuals] error:', String(err));
  process.exit(1);
});



