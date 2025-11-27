import { OpusDecoder } from 'opus-decoder';
// @ts-expect-error - ebml doesn't have type definitions
import { Decoder } from 'ebml';

/**
 * Decodes WebM/Opus audio chunks to PCM format
 * 
 * Uses proper EBML parsing to extract Opus frames from WebM container.
 * WebM structure: EBML Header -> Segment -> Tracks -> Clusters -> SimpleBlocks -> Opus frames
 */
export class WebMOpusDecoder {
  private decoder: OpusDecoder<48000> | null = null;
  private decoderReady: Promise<void> | null = null;
  private ebmlDecoder: Decoder;
  private sampleRate: number = 48000; // Opus default (input)
  private targetSampleRate: number = 24000; // OpenAI Realtime API expects 24kHz
  private channels: number = 1; // Mono
  private buffer: Buffer = Buffer.alloc(0);
  private opusTrackNumber: number | null = null;
  private pendingOpusFrames: Buffer[] = [];
  private inCluster: boolean = false;
  private currentTrackEntry: { trackNumber?: number; codecId?: string } | null = null;

  constructor() {
    // Create EBML decoder to parse WebM structure
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.ebmlDecoder = new Decoder();
    this.setupEBMLHandlers();
  }

  /**
   * Set up EBML decoder event handlers to extract Opus frames
   */
  private setupEBMLHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.ebmlDecoder.on('data', (chunk: [string, { name: string; value?: unknown; payload?: unknown; track?: number }]) => {
      const [eventType, element] = chunk;

      if (eventType === 'start') {
        // Track when we enter a Cluster
        if (element.name === 'Cluster') {
          this.inCluster = true;
        }
        // Start tracking a new TrackEntry
        if (element.name === 'TrackEntry') {
          this.currentTrackEntry = {};
        }
      }

      if (eventType === 'tag') {
        // Extract track number and codec info from TrackEntry
        if (element.name === 'TrackNumber' && typeof element.value === 'number' && this.currentTrackEntry) {
          this.currentTrackEntry.trackNumber = element.value;
        }
        if (element.name === 'CodecID' && typeof element.value === 'string' && this.currentTrackEntry) {
          this.currentTrackEntry.codecId = element.value;
          // If this is an Opus track, store its track number
          if (element.value === 'A_OPUS' && this.currentTrackEntry.trackNumber) {
            this.opusTrackNumber = this.currentTrackEntry.trackNumber;
            console.log('[webm-opus-decoder] Identified Opus track number:', this.opusTrackNumber);
          }
        }
      }

      if (eventType === 'end') {
        // Clear current track entry when TrackEntry ends
        if (element.name === 'TrackEntry') {
          this.currentTrackEntry = null;
        }
        if (element.name === 'Cluster') {
          this.inCluster = false;
        }
      }

      // Extract Opus frames from SimpleBlocks
      if (eventType === 'tag' && element.name === 'SimpleBlock' && element.payload) {
        // The EBML decoder already parses the track number into element.track
        // SimpleBlock format: [Track VarInt][Timecode 2 bytes][Flags 1 byte][Frame Data...]
        // The decoder provides: element.track (number), element.payload (Buffer with frame data)
        const trackNumber = element.track;
        let payload: Buffer;
        if (element.payload instanceof Uint8Array) {
          payload = Buffer.from(element.payload);
        } else if (element.payload instanceof Buffer) {
          payload = element.payload;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          payload = Buffer.from(String(element.payload), 'utf8');
        }
        
        if (!payload || payload.length === 0) {
          return; // No payload
        }

        // Check if this is our Opus track (or if we haven't identified it yet, accept all tracks)
        // We'll filter by codec later if needed, but for now accept all SimpleBlocks
        // The payload from the decoder should already have track number, timecode, and flags stripped
        // Actually, looking at the decoder code, element.payload contains the raw frame data
        // after the track number, timecode, and flags
        if (this.opusTrackNumber === null || trackNumber === this.opusTrackNumber) {
          // The payload should be the Opus frame data (track number, timecode, flags already parsed out)
          if (payload.length > 0) {
            this.pendingOpusFrames.push(payload);
          }
        }
      }

      if (eventType === 'end') {
        if (element.name === 'Cluster') {
          this.inCluster = false;
        }
      }
    });
  }

  /**
   * Initialize OpusDecoder asynchronously
   * OpusDecoder requires async initialization via _init()
   */
  private async ensureDecoderReady(): Promise<void> {
    if (this.decoderReady) {
      return this.decoderReady;
    }

    if (!this.decoder) {
      // OpusDecoder can be initialized with sampleRate, but the type system expects undefined
      // We'll use type assertion to work around this
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      this.decoder = new OpusDecoder({
        sampleRate: this.sampleRate as 48000,
        channels: this.channels,
        preSkip: 0,
      }) as OpusDecoder<48000>;
    }

    // OpusDecoder requires async initialization
    // Check if it has _init method and call it
    if (this.decoder && typeof (this.decoder as unknown as { _init?: () => Promise<unknown> })._init === 'function') {
      this.decoderReady = (this.decoder as unknown as { _init: () => Promise<unknown> })._init().then(() => {
        console.log('[webm-opus-decoder] OpusDecoder initialized and ready');
      }).catch((err) => {
        console.error('[webm-opus-decoder] Error initializing OpusDecoder:', String(err));
        throw err;
      });
      return this.decoderReady;
    }

    // If no _init method, assume it's ready (shouldn't happen)
    this.decoderReady = Promise.resolve();
    return this.decoderReady;
  }

  /**
   * Decode a WebM/Opus chunk to PCM
   * Returns PCM buffer when frames are decoded, null if chunk is header/metadata
   */
  async decodeChunk(webmChunk: Buffer): Promise<Buffer | null> {
    // Append to buffer - always accumulate to handle partial chunks
    this.buffer = Buffer.concat([this.buffer, webmChunk]);

    // Track frames before processing
    const framesBefore = this.pendingOpusFrames.length;

    // Feed buffer to EBML decoder (it's a Transform stream)
    // The decoder will emit 'data' events for parsed elements which we handle in setupEBMLHandlers
    // Note: EBML decoder processes synchronously during write(), so frames should be available immediately after
    try {
      // Write to the decoder - it will parse and emit events synchronously
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const canContinue = this.ebmlDecoder.write(this.buffer as unknown as Parameters<typeof this.ebmlDecoder.write>[0]);
      
      // If decoder says we can't continue, it means it's backpressured
      // This shouldn't happen in our use case, but handle it
      if (!canContinue) {
        // Wait for drain event (shouldn't happen with our small chunks)
        await new Promise<void>((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          this.ebmlDecoder.once('drain', resolve);
        });
      }
    } catch (err) {
      // EBML parsing errors might occur with incomplete chunks
      // Don't clear buffer - might need more data to complete parsing
      const errorMsg = String(err);
      // Only warn if it's not a common "waiting for more data" scenario
      if (!errorMsg.includes('waiting for more data') && !errorMsg.includes('incomplete')) {
        console.warn('[webm-opus-decoder] EBML parse error:', errorMsg);
      }
      // Keep buffer for next chunk - don't clear it
      // Check if we have frames from before this chunk
      if (this.pendingOpusFrames.length === 0) {
        return null;
      }
      // If we have frames, continue processing them below
    }

    // Check if we extracted any new frames after this write
    const framesAfter = this.pendingOpusFrames.length;
    const extractedNewFrames = framesAfter > framesBefore;

    // If we extracted frames, we can clear the buffer (decoder processed it)
    // If no frames were extracted, keep buffer for next chunk (might be incomplete)
    if (extractedNewFrames) {
      // We successfully extracted frames - clear buffer since decoder processed it
      // The EBML decoder buffers internally, so we can clear our buffer
      this.buffer = Buffer.alloc(0);
    } else if (framesAfter === 0) {
      // No frames at all - might be header/metadata or incomplete chunk
      // Keep buffer for next chunk - don't clear it yet
      // But limit buffer size to prevent memory issues
      const MAX_BUFFER_SIZE = 100 * 1024; // 100KB max buffer
      if (this.buffer.length > MAX_BUFFER_SIZE) {
        console.warn('[webm-opus-decoder] Buffer too large, clearing to prevent memory issues');
        this.buffer = Buffer.alloc(0);
      }
      return null;
    }
    // If framesAfter > 0 but no new frames extracted, we have frames from before
    // Continue processing them below

    // Check if we have any Opus frames to process
    if (this.pendingOpusFrames.length === 0) {
      // No frames yet, might be header/metadata
      return null;
    }

    // Ensure decoder is initialized and ready
    try {
      await this.ensureDecoderReady();
    } catch (err) {
      console.error('[webm-opus-decoder] Failed to initialize decoder:', String(err));
      return null;
    }

    if (!this.decoder) {
      console.error('[webm-opus-decoder] Decoder is null after initialization');
      return null;
    }

    // Process all pending Opus frames
    const opusFrames = this.pendingOpusFrames.splice(0); // Take all and clear
    const pcmChunks: Buffer[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const frame of opusFrames) {
      // Skip frames that are too small (likely not valid Opus packets)
      if (frame.length < 10) {
        continue;
      }
      
      try {
        // decodeFrame returns { channelData: Float32Array[], samplesDecoded: number, errors?: string[] }
        const result = this.decoder.decodeFrame(new Uint8Array(frame));
        
        if (result.errors && result.errors.length > 0) {
          // Log first few errors, then suppress to avoid spam
          if (errorCount < 3) {
            console.warn(`[webm-opus-decoder] Opus decode error (frame ${errorCount + 1}):`, result.errors[0], `frame size: ${frame.length} bytes`);
          }
          errorCount++;
          continue;
        }
        
        if (result.channelData && result.channelData.length > 0 && result.samplesDecoded > 0) {
          // Get first channel (mono) or interleave channels
          const channelData = result.channelData[0]; // Use first channel for mono
          
          // Convert Float32Array to Int16 PCM (little-endian)
          const pcmInt16 = new Int16Array(channelData.length);
          for (let i = 0; i < channelData.length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            pcmInt16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }
          
          // Resample from 48000 Hz to 24000 Hz (simple decimation by 2)
          const resampledPcm = this.resamplePCM(pcmInt16, this.sampleRate, this.targetSampleRate);
          if (resampledPcm.length > 0) {
            pcmChunks.push(Buffer.from(resampledPcm.buffer));
            successCount++;
          }
        }
      } catch (err) {
        // Log first few errors, then suppress
        if (errorCount < 3) {
          console.error('[webm-opus-decoder] Error decoding Opus frame:', String(err), `frame size: ${frame.length} bytes`);
        }
        errorCount++;
      }
    }

    // Log summary if there were errors
    if (errorCount > 0 && successCount === 0) {
      console.warn(`[webm-opus-decoder] All ${errorCount} frames failed to decode`);
    } else if (errorCount > 0) {
      console.log(`[webm-opus-decoder] Decoded ${successCount} frames successfully, ${errorCount} failed`);
    }

    if (pcmChunks.length === 0) {
      return null;
    }

    return Buffer.concat(pcmChunks);
  }

  /**
   * Resample PCM audio from source sample rate to target sample rate
   * Simple decimation/interpolation for common ratios (e.g., 48kHz -> 24kHz)
   */
  private resamplePCM(pcm: Int16Array, sourceRate: number, targetRate: number): Int16Array {
    if (sourceRate === targetRate) {
      return pcm;
    }

    // Simple decimation for downsampling (e.g., 48kHz -> 24kHz = take every 2nd sample)
    if (sourceRate > targetRate && sourceRate % targetRate === 0) {
      const ratio = sourceRate / targetRate;
      const outputLength = Math.floor(pcm.length / ratio);
      const output = new Int16Array(outputLength);
      
      for (let i = 0; i < outputLength; i++) {
        output[i] = pcm[i * ratio];
      }
      
      return output;
    }

    // Simple interpolation for upsampling (e.g., 16kHz -> 24kHz = repeat samples)
    if (targetRate > sourceRate && targetRate % sourceRate === 0) {
      const ratio = targetRate / sourceRate;
      const outputLength = pcm.length * ratio;
      const output = new Int16Array(outputLength);
      
      for (let i = 0; i < pcm.length; i++) {
        for (let j = 0; j < ratio; j++) {
          output[i * ratio + j] = pcm[i];
        }
      }
      
      return output;
    }

    // For non-integer ratios, use linear interpolation
    const ratio = targetRate / sourceRate;
    const outputLength = Math.round(pcm.length * ratio);
    const output = new Int16Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i / ratio;
      const index1 = Math.floor(sourceIndex);
      const index2 = Math.min(index1 + 1, pcm.length - 1);
      const fraction = sourceIndex - index1;
      
      // Linear interpolation
      output[i] = Math.round(pcm[index1] * (1 - fraction) + pcm[index2] * fraction);
    }
    
    return output;
  }

  /**
   * Reset decoder state
   */
  reset(): void {
    this.buffer = Buffer.alloc(0);
    this.decoderReady = null;
    this.pendingOpusFrames = [];
    this.opusTrackNumber = null;
    this.inCluster = false;
    // Recreate EBML decoder
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.ebmlDecoder = new Decoder();
    this.setupEBMLHandlers();
    if (this.decoder) {
      this.decoder.free();
      this.decoder = null;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.reset();
  }
}

