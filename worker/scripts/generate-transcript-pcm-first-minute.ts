#!/usr/bin/env tsx

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import OpenAI from 'openai';

const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, 'transcript.pcm');
const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_SPEED = 1;
const BYTES_PER_SAMPLE = 2;

interface TranscriptSegment {
  speaker: string;
  text: string;
  pauseMs?: number;
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

const VOICE_MAP: Record<string, string> = {
  moderator: 'alloy',
  ayana: 'sage',
  ethan: 'coral',
  default: 'alloy',
};

async function main(): Promise<void> {
  const outputPath = process.env.PCM_OUTPUT_PATH ?? DEFAULT_OUTPUT_PATH;
  const model = process.env.OPENAI_TTS_MODEL ?? DEFAULT_MODEL;
  const sampleRate = Number.parseInt(
    process.env.PCM_SAMPLE_RATE ?? String(DEFAULT_SAMPLE_RATE),
    10
  );
  const speed = Number.parseFloat(
    process.env.PCM_VOICE_SPEED ?? String(DEFAULT_SPEED)
  );
  const defaultPauseMs = Number.parseInt(
    process.env.PCM_PAUSE_MS ?? '0',
    10
  );

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('error: OPENAI_API_KEY is required');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });
  const audioChunks: Buffer[] = [];

  for (const segment of TRANSCRIPT_TEMPLATE) {
    const voice = VOICE_MAP[segment.speaker] ?? VOICE_MAP.default;
    console.log(`Synthesizing speaker="${segment.speaker}" voice="${voice}"`);

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

    const pauseDuration =
      typeof segment.pauseMs === 'number' && segment.pauseMs >= 0
        ? segment.pauseMs
        : defaultPauseMs;
    if (pauseDuration > 0) {
      const pauseBuffer = Buffer.alloc(
        Math.round((pauseDuration / 1_000) * sampleRate * BYTES_PER_SAMPLE),
        0
      );
      audioChunks.push(pauseBuffer);
    }
  }

  const combined = Buffer.concat(audioChunks);
  if (combined.length === 0) {
    console.error('error: Synthesized audio payload is empty');
    process.exit(1);
  }

  if (combined.length % BYTES_PER_SAMPLE !== 0) {
    console.error(
      `error: PCM payload size (${combined.length} bytes) is not aligned to ${BYTES_PER_SAMPLE}-byte samples`
    );
    process.exit(1);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, combined);
  console.log(`✅ Wrote ${combined.length} bytes to ${outputPath}`);
}

void main().catch((err: unknown) => {
  console.error('error:', String(err));
  process.exit(1);
});
