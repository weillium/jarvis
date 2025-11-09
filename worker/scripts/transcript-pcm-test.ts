#!/usr/bin/env tsx

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_BYTES_PER_SAMPLE = 2;
const DEFAULT_ENCODING = 'pcm_s16le';
const DEFAULT_EVENT_ID = 'db6eb756-a8e9-4c59-bafd-59f83e72ff4e';
const DEFAULT_AUDIO_PATH = '/Users/will-liao/Downloads/output_24khz_mono.pcm';
const DEFAULT_WORKER_URL = 'http://localhost:3001';
const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:54421';
const DEFAULT_SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30_000;

interface TranscriptRow {
  id: number;
  seq: number;
  text: string;
  at_ms: number | null;
  speaker: string | null;
  final: boolean | null;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const normalizedArgs = rawArgs.map((arg) => {
    if (!arg.startsWith('--') || arg === '--') {
      return arg;
    }

    const [flag, ...rest] = arg.split('=');
    const camelFlag = flag
      .slice(2)
      .split('-')
      .filter(Boolean)
      .map((segment, index) =>
        index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1)
      )
      .join('');
    const normalizedFlag = `--${camelFlag}`;
    return rest.length > 0 ? `${normalizedFlag}=${rest.join('=')}` : normalizedFlag;
  });

  const {
    values: cliOptions,
    positionals,
  } = parseArgs({
    args: normalizedArgs,
    options: {
      sampleRate: { type: 'string' },
      bytesPerSample: { type: 'string' },
      chunkMs: { type: 'string' },
      encoding: { type: 'string' },
      singleChunk: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  const [eventIdPos, audioPathPos, workerUrlPos] = positionals;

  const eventId = eventIdPos ?? process.env.EVENT_ID ?? DEFAULT_EVENT_ID;
  const audioPath = audioPathPos ?? process.env.PCM_PATH ?? DEFAULT_AUDIO_PATH;
  const workerUrl = workerUrlPos ?? process.env.WORKER_URL ?? DEFAULT_WORKER_URL;
  const sampleRate = parsePositiveInteger(
    cliOptions.sampleRate ?? process.env.PCM_SAMPLE_RATE,
    DEFAULT_SAMPLE_RATE,
    'sample rate'
  );
  const bytesPerSample = parsePositiveInteger(
    cliOptions.bytesPerSample ?? process.env.PCM_BYTES_PER_SAMPLE,
    DEFAULT_BYTES_PER_SAMPLE,
    'bytes per sample'
  );
  const targetChunkMs = parsePositiveInteger(
    cliOptions.chunkMs ?? process.env.STREAM_CHUNK_DURATION_MS,
    20,
    'chunk duration (ms)'
  );
  const encoding =
    cliOptions.encoding ?? process.env.PCM_ENCODING ?? DEFAULT_ENCODING;
  const singleChunk =
    cliOptions.singleChunk === true ||
    process.env.PCM_SINGLE_CHUNK === '1';

  if (!eventId) {
    console.error('[transcript-test] error:', 'event_id is required');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const baselineSeq = await getLatestSeq(supabase, eventId);

  const audioBuffer = await readPcm(audioPath);
  const sampleCount = audioBuffer.length / bytesPerSample;
  if (!Number.isInteger(sampleCount)) {
    console.error(
      '[transcript-test] error:',
      `PCM payload size (${audioBuffer.length} bytes) is not aligned to ${bytesPerSample}-byte samples`
    );
    process.exit(1);
  }

  const trimmedSampleCount = singleChunk
    ? Math.max(1, Math.round((targetChunkMs / 1_000) * sampleRate))
    : Math.max(1, Math.floor(sampleCount / 2));
  const trimmedByteLength = Math.min(
    trimmedSampleCount * bytesPerSample,
    audioBuffer.length
  );
  const trimmedBuffer = audioBuffer.subarray(0, trimmedByteLength);

  const chunkSampleCount = Math.max(1, Math.round((targetChunkMs / 1_000) * sampleRate));
  const chunkByteLength = chunkSampleCount * bytesPerSample;
  const totalChunks = singleChunk
    ? 1
    : Math.max(1, Math.ceil(trimmedBuffer.length / chunkByteLength));

  console.log(
    [
      `🚀 Streaming ${totalChunks} chunk(s)`,
      `targeting ~${targetChunkMs} ms each`,
      `sampleRate=${sampleRate} Hz`,
      `bytesPerSample=${bytesPerSample}`,
      `encoding=${encoding}`,
      `trimmed=${trimmedByteLength} bytes (original ${audioBuffer.length} bytes)`,
    ].join(' | ')
  );

  let chunkSeq = 0;
  for (let offset = 0; offset < trimmedBuffer.length; offset += chunkByteLength) {
    const chunkBuffer = trimmedBuffer.subarray(
      offset,
      Math.min(offset + chunkByteLength, trimmedBuffer.length)
    );
    const chunkSamples = chunkBuffer.length / bytesPerSample;
    const chunkDurationMs = Math.max(1, Math.round((chunkSamples / sampleRate) * 1_000));
    const chunkBase64 = chunkBuffer.toString('base64');
    const isLastChunk = offset + chunkByteLength >= trimmedBuffer.length;

    const payload = {
      event_id: eventId,
      audio_base64: chunkBase64,
      is_final: isLastChunk,
      sample_rate: sampleRate,
      bytes_per_sample: bytesPerSample,
      encoding,
      duration_ms: chunkDurationMs,
      seq: chunkSeq,
    };

    const response = await fetch(`${workerUrl}/sessions/transcript/audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      console.error(
        '[transcript-test] error:',
        `Worker rejected chunk ${chunkSeq + 1}/${totalChunks} (${response.status}): ${bodyText}`
      );
      process.exit(1);
    }

    console.log(
      `✅ Sent chunk ${chunkSeq + 1}/${totalChunks} (${chunkBuffer.length} bytes, ~${chunkDurationMs} ms, seq=${chunkSeq})`
    );

    chunkSeq += 1;

    // Wait roughly the chunk duration to simulate live streaming cadence
    if (!isLastChunk) {
      await delay(Math.max(chunkDurationMs, targetChunkMs));
    }
    if (singleChunk) {
      break;
    }
  }

  console.log('⏳ Waiting for transcript rows...');

  const transcripts = await waitForTranscripts(supabase, eventId, baselineSeq, totalChunks);

  if (transcripts.length === 0) {
    console.error('[transcript-test] error:', 'Timed out waiting for transcript output');
    process.exit(1);
  }

  console.log(`\n📝 Received ${transcripts.length} transcript row(s) since baseline seq ${baselineSeq}`);
  console.log('--------------------------------------------------------');
  for (const row of transcripts) {
    const timestamp = row.at_ms ?? null;
    const speaker = row.speaker ?? 'Unknown speaker';
    console.log(`Seq: ${row.seq} | Speaker: ${speaker} | Timestamp (ms): ${timestamp} | Final: ${row.final !== false}`);
    console.log(row.text);
    console.log('--------------------------------------------------------');
  }
}

async function readPcm(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (err: unknown) {
    console.error('[transcript-test] error:', String(err));
    process.exit(1);
  }
}

function parsePositiveInteger(
  rawValue: string | undefined,
  fallback: number,
  label: string
): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error('[transcript-test] error:', `Invalid ${label}: ${rawValue}`);
    process.exit(1);
  }
  return parsed;
}

async function getLatestSeq(supabase: SupabaseClient, eventId: string): Promise<number> {
  const { data, error } = await supabase
    .from('transcripts')
    .select('seq')
    .eq('event_id', eventId)
    .order('seq', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[transcript-test] error:', String(error));
    process.exit(1);
  }

  const records = (data ?? []) as Array<{ seq: number | null }>;
  const seqValue = records[0]?.seq ?? 0;
  return typeof seqValue === 'number' ? seqValue : 0;
}

async function waitForTranscripts(
  supabase: SupabaseClient,
  eventId: string,
  baselineSeq: number,
  expectedCount: number
): Promise<TranscriptRow[]> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('transcripts')
      .select('id, seq, text, at_ms, speaker, final')
      .eq('event_id', eventId)
      .gt('seq', baselineSeq)
      .order('seq', { ascending: true })
      .limit(expectedCount);

    if (error) {
      console.error('[transcript-test] error:', String(error));
      process.exit(1);
    }

    const transcripts = (data ?? []) as TranscriptRow[];

    if (transcripts.length > 0) {
      if (transcripts.length >= expectedCount) {
        return transcripts;
      }
    }

    await delay(POLL_INTERVAL_MS);
  }

  const { data } = await supabase
    .from('transcripts')
    .select('id, seq, text, at_ms, speaker, final')
    .eq('event_id', eventId)
    .gt('seq', baselineSeq)
    .order('seq', { ascending: true });

  return ((data ?? []) as TranscriptRow[]) ?? [];
}

main().catch((err: unknown) => {
  console.error('[transcript-test] error:', String(err));
  process.exit(1);
});


