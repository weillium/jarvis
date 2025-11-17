#!/usr/bin/env tsx

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import OpenAI from 'openai';

const DEFAULT_OUTPUT_PATH = path.resolve(
  __dirname,
  'generated-transcript-second-minute.pcm'
);
const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_SPEED = 1;
const BYTES_PER_SAMPLE = 2;
const DEFAULT_EVENT_ID = '1b377cd5-4c73-4eee-ada8-fcc3800f2bbb';
const DEFAULT_WORKER_URL = 'http://localhost:3001';
const DEFAULT_ENCODING = 'pcm_s16le';
const DEFAULT_CHUNK_DURATION_MS = 20;
const MINUTE_MS = 60_000;
const SECOND_MINUTE_START_MS = MINUTE_MS;
const SECOND_MINUTE_DURATION_MS = MINUTE_MS;
const CAPTURE_DURATION_MS = SECOND_MINUTE_START_MS + SECOND_MINUTE_DURATION_MS;

type SpeakerId = string;

interface TranscriptSegment {
  speaker: SpeakerId;
  text: string;
  pauseMs?: number;
}

type VoiceAssignments = Record<string, string>;

interface StreamOptions {
  buffer: Buffer;
  eventId: string;
  workerUrl: string;
  sampleRate: number;
  bytesPerSample: number;
  chunkMs: number;
  encoding: string;
  singleChunk: boolean;
}

const TRANSCRIPT_TEMPLATE: TranscriptSegment[] = [
  {
    speaker: 'moderator',
    text:
      "I want to start on China's slowdown -- not at the country level, but at the monetary transmission layer. Here's the live debate: are ASEAN central banks anchoring around China right now, or are they anchoring around the Fed? And what actually shows up in FX first?",
  },
  {
    speaker: 'ayana',
    text:
      'Short answer: they still anchor around the Fed. But the reason that is the answer is subtle. ASEAN central banks know that domestic growth spillovers from China matter -- but their FX pass-through sensitivities are still overwhelmingly USD-driven. So, even when the growth shock is China, the first-order policy reference point is the Fed.',
  },
  {
    speaker: 'ethan',
    text:
      "Totally agree. If you look at one-year NDF pricing -- particularly in IDR and MYR -- the so-called China slowdown factor shows up much more as an impulse to capital flow balance, not the inflation path. So central banks do not respond with rate policy as their first instrument. They respond with liquidity operations and forward book management.",
  },
  {
    speaker: 'moderator',
    text:
      "So let's make that concrete. If I'm Bank Indonesia -- and I see the property crisis in China worsening, credit tightening continuing, exports about to roll -- what is the first thing I do?",
  },
  {
    speaker: 'ayana',
    text:
      'Indonesia? First thing: you make sure credit conditions do not tighten unintentionally via FX expectations. They learned this in 2013 and 2018. You protect the financial conditions channel first. Rate policy is not how you manage the spillover.',
  },
  {
    speaker: 'ethan',
    text:
      'Exactly. In fact, if you look at their recent operations, the BI seven day RRR toolkit is being used almost as a psychological floor. And the FX intervention line is more continuous than people think. They want to avoid a self-fulfilling depreciation panic -- especially because foreign ownership in local bonds is lower now versus 2018, which changes how fast pressure builds.',
  },
  {
    speaker: 'moderator',
    text:
      "Ok, so I want to go one click deeper. There's been chatter that China's slowdown is creating a weird positive impulse for ASEAN in a few verticals, because supply chain relocations accelerate. Is that real? Or is that just LinkedIn meme economics?",
  },
  {
    speaker: 'ayana',
    text:
      'There are offsets. Vietnam sees some of this. Thailand too. But these offsets are not large enough to fully counter the drag from China demand-side contraction. That is the part everyone underestimates. Everyone talks about a China supply chain exit. Very few model a China structural demand downgrade. The latter is bigger.',
  },
  {
    speaker: 'ethan',
    text:
      'Yep. And from an FX perspective, that positive relocation story shows up in flows that are lumpy and non-monetary. They do not create the kind of persistent carry environment that drives a currency narrative. The negative shock to regional exports is smoother, larger, and has more macro-transmission reach.',
  },
  {
    speaker: 'moderator',
    text:
      'So if we zoom out, how much does the Fed even matter here? It sounds like China is the fundamental shock, but USD is the pricing regime.',
  },
  {
    speaker: 'ayana',
    text:
      'Correct. The Fed matters as the denominator of global capital. China matters as the numerator of regional growth.',
  },
  {
    speaker: 'moderator',
    text: "That is a killer line.",
  },
  {
    speaker: 'ayana',
    text:
      'And when you take those two ideas together, you see why ASEAN central banks look so passive right now. They are not passive. They are managing two different orthogonal regimes.',
  },
  {
    speaker: 'ethan',
    text:
      "And this is why the next 12 to 18 months are going to be uncomfortable. Because ASEAN's inflation trajectory is not really their policy choice. It is the intersection of USD liquidity and China demand. That is the real constraint.",
  },
  {
    speaker: 'moderator',
    text:
      'So I will end this five-minute segment with a yes or no from both of you: is ASEAN policy space structurally narrowing because of this two-regime dynamic?',
  },
  {
    speaker: 'ayana',
    text: 'Yes. Structurally, yes.',
  },
  {
    speaker: 'ethan',
    text:
      "Yes. And it is going to be obvious in FX spot before it is obvious in rates.",
  },
];

const DEFAULT_VOICE_MAP: VoiceAssignments = {
  moderator: 'alloy',
  ayana: 'sage',
  ethan: 'coral',
  default: 'alloy',
};

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const normalizedArgs = normalizeFlagArgs(rawArgs);
  const { values: cliOptions } = parseArgs({
    args: normalizedArgs,
    options: {
      outputPath: { type: 'string' },
      sampleRate: { type: 'string' },
      model: { type: 'string' },
      speed: { type: 'string' },
      voices: { type: 'string' },
      pauseMs: { type: 'string' },
      dryRun: { type: 'boolean' },
      eventId: { type: 'string' },
      workerUrl: { type: 'string' },
      encoding: { type: 'string' },
      chunkMs: { type: 'string' },
      singleChunk: { type: 'boolean' },
      skipStream: { type: 'boolean' },
    },
  });

  const outputPath =
    cliOptions.outputPath ??
    process.env.PCM_OUTPUT_PATH ??
    DEFAULT_OUTPUT_PATH;
  const model = cliOptions.model ?? process.env.OPENAI_TTS_MODEL ?? DEFAULT_MODEL;
  const sampleRate = parsePositiveInteger(
    cliOptions.sampleRate ?? process.env.PCM_SAMPLE_RATE,
    DEFAULT_SAMPLE_RATE,
    'sample rate'
  );
  const speed = parsePositiveFloat(
    cliOptions.speed ?? process.env.PCM_VOICE_SPEED,
    DEFAULT_SPEED,
    'speed'
  );
  const defaultPauseMs = parseNonNegativeInteger(
    cliOptions.pauseMs ?? process.env.PCM_PAUSE_MS,
    0,
    'pause duration (ms)'
  );
  const eventId =
    cliOptions.eventId ?? process.env.EVENT_ID ?? DEFAULT_EVENT_ID;
  const workerUrl =
    cliOptions.workerUrl ?? process.env.WORKER_URL ?? DEFAULT_WORKER_URL;
  const encoding =
    cliOptions.encoding ?? process.env.PCM_ENCODING ?? DEFAULT_ENCODING;
  const chunkMs = parsePositiveInteger(
    cliOptions.chunkMs ?? process.env.STREAM_CHUNK_DURATION_MS,
    DEFAULT_CHUNK_DURATION_MS,
    'chunk duration (ms)'
  );
  const singleChunk =
    cliOptions.singleChunk === true ||
    process.env.PCM_SINGLE_CHUNK === '1';
  const skipStream =
    cliOptions.skipStream === true ||
    process.env.PCM_SKIP_STREAM === '1';

  if (!eventId && !skipStream) {
    console.error('[generate-pcm-first-minute] error:', 'eventId is required when streaming to worker');
    process.exit(1);
  }

  if (!workerUrl && !skipStream) {
    console.error('[generate-pcm-first-minute] error:', 'workerUrl is required when streaming to worker');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      '[generate-pcm-first-minute] error:',
      'OPENAI_API_KEY is required to synthesize audio'
    );
    process.exit(1);
  }

  const transcript = TRANSCRIPT_TEMPLATE;
  validateTranscript(transcript);
  const voiceOverrides = parseVoiceOverrides(cliOptions.voices);
  const voiceAssignments = resolveVoiceAssignments(transcript, voiceOverrides);

  const containsPlaceholder = transcript.some(segment =>
    segment.text.includes('<<')
  );
  if (containsPlaceholder) {
    console.error(
      '[generate-pcm-first-minute] error:',
      'Replace transcript placeholders (<<...>>) before generating audio'
    );
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });
  const audioChunks: Buffer[] = [];
  let totalBytes = 0;
  const maxBytes = calculateMaxBytes(
    sampleRate,
    CAPTURE_DURATION_MS,
    BYTES_PER_SAMPLE
  );
  let durationLimitReached = false;

  for (const segment of transcript) {
    if (durationLimitReached) {
      break;
    }

    const voice = voiceAssignments[segment.speaker] ?? voiceAssignments.default;
    if (!voice) {
      console.error(
        '[generate-pcm-first-minute] error:',
        `No voice mapping found for speaker "${String(segment.speaker)}"`
      );
      process.exit(1);
    }

    console.log(
      `[generate-pcm-first-minute] Synthesizing speaker="${String(segment.speaker)}" voice="${voice}"`
    );

    if (cliOptions.dryRun === true) {
      continue;
    }

    const response = await openai.audio.speech.create({
      model,
      voice,
      input: segment.text,
      response_format: 'pcm',
      speed,
    });

    const arrayBuffer = await response.arrayBuffer();
    const segmentBuffer = Buffer.from(arrayBuffer);
    audioChunks.push(segmentBuffer);
    totalBytes += segmentBuffer.length;

    ({ totalBytes, durationLimitReached } = enforceDurationLimit(
      audioChunks,
      totalBytes,
      maxBytes,
      BYTES_PER_SAMPLE,
      CAPTURE_DURATION_MS,
      '[generate-pcm-first-minute]'
    ));

    if (durationLimitReached) {
      break;
    }

    const pauseDuration =
      typeof segment.pauseMs === 'number' && segment.pauseMs >= 0
        ? segment.pauseMs
        : defaultPauseMs;
    if (pauseDuration > 0) {
      console.log(`[generate-pcm-first-minute] Inserting ${pauseDuration} ms pause`);
      const pauseBuffer = Buffer.alloc(
        Math.round((pauseDuration / 1_000) * sampleRate * BYTES_PER_SAMPLE),
        0
      );
      audioChunks.push(pauseBuffer);
      totalBytes += pauseBuffer.length;

      ({ totalBytes, durationLimitReached } = enforceDurationLimit(
        audioChunks,
        totalBytes,
        maxBytes,
        BYTES_PER_SAMPLE,
        CAPTURE_DURATION_MS,
        '[generate-pcm-first-minute]'
      ));
    }
  }

  if (cliOptions.dryRun === true) {
    console.log('[generate-pcm-first-minute] Dry run complete, no audio generated');
    return;
  }

  const combined = Buffer.concat(audioChunks);
  if (combined.length === 0) {
    console.error('[generate-pcm-first-minute] error:', 'Synthesized audio payload is empty');
    process.exit(1);
  }

  if (combined.length % BYTES_PER_SAMPLE !== 0) {
    console.error(
      '[generate-pcm-first-minute] error:',
      `PCM payload size (${combined.length} bytes) is not aligned to ${BYTES_PER_SAMPLE}-byte samples`
    );
    process.exit(1);
  }

  const totalSamples = combined.length / BYTES_PER_SAMPLE;
  const captureStartSample = Math.round(
    (SECOND_MINUTE_START_MS / 1_000) * sampleRate
  );
  const captureDurationSamples = Math.round(
    (SECOND_MINUTE_DURATION_MS / 1_000) * sampleRate
  );
  const captureEndSample = captureStartSample + captureDurationSamples;

  if (totalSamples <= captureStartSample) {
    console.error(
      '[generate-pcm-first-minute] error:',
      `Synthesized audio is shorter than ${SECOND_MINUTE_START_MS} ms; cannot extract second minute`
    );
    process.exit(1);
  }

  const boundedEndSample = Math.min(captureEndSample, totalSamples);
  const captureStartByte = captureStartSample * BYTES_PER_SAMPLE;
  const captureEndByte = boundedEndSample * BYTES_PER_SAMPLE;
  const secondMinuteBuffer = combined.subarray(captureStartByte, captureEndByte);

  if (secondMinuteBuffer.length === 0) {
    console.error(
      '[generate-pcm-first-minute] error:',
      'Extracted second-minute payload is empty'
    );
    process.exit(1);
  }

  await ensureDirectory(path.dirname(outputPath));
  await writeFile(outputPath, secondMinuteBuffer);
  console.log(
    `[generate-pcm-first-minute] ✅ Wrote ${secondMinuteBuffer.length} bytes (minute 2 of transcript) to ${outputPath}`
  );

  if (skipStream) {
    console.log('[generate-pcm-first-minute] Skipping live stream (--skip-stream enabled)');
    return;
  }

  await streamToWorker({
    buffer: secondMinuteBuffer,
    eventId,
    workerUrl,
    sampleRate,
    bytesPerSample: BYTES_PER_SAMPLE,
    chunkMs,
    encoding,
    singleChunk,
  });
}

function normalizeFlagArgs(args: string[]): string[] {
  return args.map(arg => {
    if (!arg.startsWith('--') || arg === '--') {
      return arg;
    }
    const [flag, ...rest] = arg.split('=');
    const camelFlag = flag
      .slice(2)
      .split('-')
      .filter(Boolean)
      .map((segment, index) =>
        index === 0
          ? segment
          : segment.charAt(0).toUpperCase() + segment.slice(1)
      )
      .join('');
    const normalized = `--${camelFlag}`;
    return rest.length > 0 ? `${normalized}=${rest.join('=')}` : normalized;
  });
}

function parseVoiceOverrides(raw: string | undefined): VoiceAssignments {
  if (!raw) {
    return {};
  }

  const overrides: VoiceAssignments = {};

  for (const assignment of raw.split(',')) {
    const trimmed = assignment.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
      console.warn(
        '[generate-pcm-first-minute] warning:',
        `Skipping malformed voice override "${trimmed}" (expected speaker:voice)`
      );
      continue;
    }

    const speaker = trimmed.slice(0, separatorIndex).trim();
    const voice = trimmed.slice(separatorIndex + 1).trim();
    if (speaker.length === 0 || voice.length === 0) {
      console.warn(
        '[generate-pcm-first-minute] warning:',
        `Skipping malformed voice override "${trimmed}" (empty speaker or voice)`
      );
      continue;
    }

    overrides[speaker] = voice;
  }

  return overrides;
}

function resolveVoiceAssignments(
  transcript: TranscriptSegment[],
  overrides: VoiceAssignments
): VoiceAssignments {
  const assignments: VoiceAssignments = { ...DEFAULT_VOICE_MAP };

  for (const [speaker, voice] of Object.entries(overrides)) {
    assignments[speaker] = voice;
  }

  const uniqueSpeakers = new Set<SpeakerId>(transcript.map(segment => segment.speaker));
  for (const speaker of uniqueSpeakers) {
    if (!assignments[speaker]) {
      assignments[speaker] = assignments.default ?? DEFAULT_VOICE_MAP.default;
    }
  }

  return assignments;
}

function validateTranscript(transcript: TranscriptSegment[]): void {
  if (transcript.length === 0) {
    console.error('[generate-pcm-first-minute] error:', 'Transcript template is empty');
    process.exit(1);
  }

  const uniqueSpeakers = new Set(transcript.map(segment => segment.speaker));
  if (uniqueSpeakers.size < 3) {
    console.error(
      '[generate-pcm-first-minute] error:',
      'Transcript must define at least three distinct speakers to exercise multi-voice support'
    );
    process.exit(1);
  }

  for (const [index, segment] of transcript.entries()) {
    if (typeof segment.text !== 'string' || segment.text.trim().length === 0) {
      console.error(
        '[generate-pcm-first-minute] error:',
        `Transcript segment ${index + 1} is missing text`
      );
      process.exit(1);
    }
  }
}

async function streamToWorker(options: StreamOptions): Promise<void> {
  const {
    buffer,
    eventId,
    workerUrl,
    sampleRate,
    bytesPerSample,
    chunkMs,
    encoding,
    singleChunk,
  } = options;

  const chunkSampleCount = Math.max(
    1,
    Math.round((chunkMs / 1_000) * sampleRate)
  );
  const chunkByteLength = chunkSampleCount * bytesPerSample;

  const trimmedBuffer = singleChunk
    ? buffer.subarray(0, Math.min(buffer.length, chunkByteLength))
    : buffer;

  const totalChunks = singleChunk
    ? 1
    : Math.max(1, Math.ceil(trimmedBuffer.length / chunkByteLength));

  console.log(
    `[generate-pcm-first-minute] 🚀 Streaming ${totalChunks} chunk(s) to worker transcript endpoint`
  );

  let seq = 0;
  for (let offset = 0; offset < trimmedBuffer.length; offset += chunkByteLength) {
    const chunkBuffer = trimmedBuffer.subarray(
      offset,
      Math.min(offset + chunkByteLength, trimmedBuffer.length)
    );
    const chunkSamples = chunkBuffer.length / bytesPerSample;
    const chunkDurationMs = Math.max(
      1,
      Math.round((chunkSamples / sampleRate) * 1_000)
    );
    const payload = {
      event_id: eventId,
      audio_base64: chunkBuffer.toString('base64'),
      is_final: offset + chunkByteLength >= trimmedBuffer.length,
      sample_rate: sampleRate,
      bytes_per_sample: bytesPerSample,
      encoding,
      duration_ms: chunkDurationMs,
      seq,
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
        '[generate-pcm-first-minute] error:',
        `Worker rejected chunk ${seq + 1}/${totalChunks} (${response.status}): ${bodyText}`
      );
      process.exit(1);
    }

    console.log(
      `[generate-pcm-first-minute] ✅ Sent chunk ${seq + 1}/${totalChunks} (${chunkBuffer.length} bytes, ~${chunkDurationMs} ms, seq=${seq})`
    );

    seq += 1;

    if (!singleChunk && offset + chunkByteLength < trimmedBuffer.length) {
      await delay(Math.max(chunkDurationMs, chunkMs));
    }
  }

  console.log('[generate-pcm-first-minute] 📬 Completed live stream to worker transcript agent');
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
    console.error('[generate-pcm-first-minute] error:', `Invalid ${label}: ${rawValue}`);
    process.exit(1);
  }

  return parsed;
}

function parseNonNegativeInteger(
  rawValue: string | undefined,
  fallback: number,
  label: string
): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error('[generate-pcm-first-minute] error:', `Invalid ${label}: ${rawValue}`);
    process.exit(1);
  }

  return parsed;
}

function parsePositiveFloat(
  rawValue: string | undefined,
  fallback: number,
  label: string
): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error('[generate-pcm-first-minute] error:', `Invalid ${label}: ${rawValue}`);
    process.exit(1);
  }

  return parsed;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  if (dirPath.trim().length === 0) {
    return;
  }

  await mkdir(dirPath, { recursive: true });
}

function calculateMaxBytes(
  sampleRate: number,
  maxDurationMs: number,
  bytesPerSample: number
): number {
  const maxSamples = Math.max(
    1,
    Math.round((maxDurationMs / 1_000) * sampleRate)
  );
  return maxSamples * bytesPerSample;
}

function enforceDurationLimit(
  chunks: Buffer[],
  totalBytes: number,
  maxBytes: number,
  bytesPerSample: number,
  maxDurationMs: number,
  prefix: string
): { totalBytes: number; durationLimitReached: boolean } {
  if (totalBytes <= maxBytes) {
    return { totalBytes, durationLimitReached: false };
  }

  let excess = totalBytes - maxBytes;

  for (let i = chunks.length - 1; i >= 0 && excess > 0; i -= 1) {
    const chunk = chunks[i];

    if (chunk.length <= excess) {
      excess -= chunk.length;
      totalBytes -= chunk.length;
      chunks.splice(i, 1);
      continue;
    }

    const desiredLength = chunk.length - excess;
    const alignedLength =
      desiredLength - (desiredLength % bytesPerSample);

    if (alignedLength <= 0) {
      excess -= chunk.length;
      totalBytes -= chunk.length;
      chunks.splice(i, 1);
      continue;
    }

    chunks[i] = chunk.subarray(0, alignedLength);
    totalBytes -= chunk.length - alignedLength;
    excess = 0;
  }

  console.log(
    `${prefix} Reached ${maxDurationMs} ms cap; truncating additional audio`
  );
  return { totalBytes, durationLimitReached: true };
}

void main().catch((err: unknown) => {
  console.error('[generate-pcm-first-minute] error:', String(err));
  process.exit(1);
});


