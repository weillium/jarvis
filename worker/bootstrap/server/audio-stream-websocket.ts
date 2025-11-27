import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Server as HTTPServer } from 'http';
import type { Orchestrator } from '../../runtime/orchestrator';
import type { TranscriptAudioChunk } from '../../runtime/transcript-ingestion-service';
import { WebMOpusDecoder } from '../../lib/audio/webm-opus-decoder';

interface AudioStreamSession {
  eventId: string;
  client: string;
  codec: string;
  sampleRate?: number;
  bytesPerSample?: number;
  seq: number;
  startedAt: number;
  decoder?: WebMOpusDecoder;
  speaker?: string; // Speaker identifier from start message
}

interface StartMessage {
  type: 'start';
  client: string;
  codec: string;
  event_id?: string;
  eventId?: string;
  sample_rate?: number;
  sampleRate?: number;
  bytes_per_sample?: number;
  bytesPerSample?: number;
  speaker?: string; // Optional speaker identifier
}

interface StopMessage {
  type: 'stop';
}

type ControlMessage = StartMessage | StopMessage;

const isStartMessage = (msg: unknown): msg is StartMessage => {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'start' &&
    'client' in msg &&
    'codec' in msg &&
    typeof msg.client === 'string' &&
    typeof msg.codec === 'string'
  );
};

const isStopMessage = (msg: unknown): msg is StopMessage => {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'stop'
  );
};

const safeParseJson = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const createAudioStreamWebSocketServer = (
  server: HTTPServer,
  orchestrator: Orchestrator,
  log: (...args: unknown[]) => void
): WebSocketServer => {
  const wss = new WebSocketServer({
    noServer: true,
  });

  // Handle HTTP upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    
    if (url.pathname === '/audio/stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Don't destroy socket if path doesn't match - other handlers might want it
  });

  // Track active sessions
  const sessions = new Map<WebSocket, AudioStreamSession>();

  wss.on('connection', (ws: WebSocket, req) => {
    const clientInfo = `${req.socket.remoteAddress || 'unknown'}:${req.socket.remotePort || 'unknown'}`;
    log(`[audio-stream-ws] New WebSocket connection from ${clientInfo}`);

    ws.on('message', (data: Buffer | string) => {
      void (async () => {
        try {
        // Handle text messages (control messages)
        // In WebSocket: strings = text messages, Buffers = binary messages
        if (typeof data === 'string') {
          // Text message - must be a control message (start/stop)
          log(`[audio-stream-ws] Received TEXT message from ${clientInfo}, length: ${data.length}`);
          
          const message = safeParseJson<ControlMessage>(data);
          
          if (!message) {
            log(`[audio-stream-ws] Failed to parse text message as JSON from ${clientInfo}. Text: ${data.substring(0, 500)}`);
            ws.send(JSON.stringify({ ok: false, error: 'Invalid JSON message' }));
            return;
          }
          
          log(`[audio-stream-ws] Parsed control message from ${clientInfo}:`, JSON.stringify(message));
        } else {
          // Binary message - check if it looks like a JSON control message (fallback for encoding issues)
          const dataStr = data.toString('utf-8');
          const looksLikeJson = dataStr.trim().startsWith('{') && dataStr.includes('"type"');
          
          if (looksLikeJson) {
            log(`[audio-stream-ws] Received BINARY message that looks like JSON from ${clientInfo}, length: ${data.length} bytes. Attempting to parse as control message...`);
            log(`[audio-stream-ws] Binary data as string (first 200 chars): ${dataStr.substring(0, 200)}`);
            
            const message = safeParseJson<ControlMessage>(dataStr);
            
            if (!message) {
              log(`[audio-stream-ws] Failed to parse binary-as-JSON message from ${clientInfo}`);
              // Fall through to binary audio handling
            } else {
              log(`[audio-stream-ws] Successfully parsed binary-as-JSON control message from ${clientInfo}:`, JSON.stringify(message));
              
              // Handle as control message
              if (isStartMessage(message)) {
                log(`[audio-stream-ws] Start message received from ${clientInfo} (via binary fallback)`);
                const eventId = message.event_id || message.eventId;
                if (!eventId || typeof eventId !== 'string') {
                  const error = 'event_id is required';
                  log(`[audio-stream-ws] Missing event_id in start message from ${clientInfo}. Message: ${JSON.stringify(message)}`);
                  ws.send(JSON.stringify({ ok: false, error }));
                  return;
                }

                // Check if session already exists
                if (sessions.has(ws)) {
                  log(`[audio-stream-ws] Session already exists for ${clientInfo}, replacing it`);
                  sessions.delete(ws);
                }

                const session: AudioStreamSession = {
                  eventId,
                  client: message.client,
                  codec: message.codec,
                  sampleRate: message.sample_rate || message.sampleRate,
                  bytesPerSample: message.bytes_per_sample || message.bytesPerSample,
                  seq: 0,
                  startedAt: Date.now(),
                  speaker: typeof message.speaker === 'string' ? message.speaker : undefined,
                };

                // Initialize decoder for WebM/Opus
                if (message.codec === 'webm-opus' || message.codec?.includes('webm') || message.codec?.includes('opus')) {
                  session.decoder = new WebMOpusDecoder();
                  log(`[audio-stream-ws] Initialized WebM/Opus decoder for session`);
                }

                sessions.set(ws, session);
                log(`[audio-stream-ws] Session started: event=${eventId}, client=${message.client}, codec=${message.codec}, from=${clientInfo}`);
                ws.send(JSON.stringify({ ok: true, message: 'Session started' }));
                return;
              }

              if (isStopMessage(message)) {
                const session = sessions.get(ws);
                if (session) {
                  try {
                    // Send final chunk with proper metadata
                    await orchestrator.appendTranscriptAudio(session.eventId, {
                      audioBase64: '', // Empty for final chunk
                      seq: session.seq,
                      isFinal: true,
                      sampleRate: session.sampleRate || 24000,
                      bytesPerSample: session.bytesPerSample || 2,
                      encoding: session.codec || 'pcm_s16le',
                      durationMs: 0, // Final chunk has no duration
                      speaker: session.speaker, // Include speaker in final chunk
                    });
                    log(`[audio-stream-ws] Final chunk sent for event ${session.eventId} from ${clientInfo}`);
                  } catch (err) {
                    log(`[audio-stream-ws] Error sending final chunk: ${String(err)}`);
                  }
                  
                  // Cleanup decoder
                  if (session.decoder) {
                    session.decoder.destroy();
                  }
                  
                  sessions.delete(ws);
                  log(`[audio-stream-ws] Session stopped: event=${session.eventId}, from=${clientInfo}`);
                }
                ws.send(JSON.stringify({ ok: true, message: 'Session stopped' }));
                return;
              }

              log(`[audio-stream-ws] Unknown message type from ${clientInfo} (via binary fallback). Message: ${JSON.stringify(message)}`);
              ws.send(JSON.stringify({ ok: false, error: `Unknown message type: ${typeof (message as { type?: unknown })?.type === 'string' ? (message as { type: string }).type : 'unknown'}` }));
              return;
            }
          }
          
          // Not a control message, continue to binary audio handling below
        }
        
        // If we got here and it was a string, it wasn't a valid control message
        if (typeof data === 'string') {
          log(`[audio-stream-ws] Received string that wasn't a valid control message, ignoring`);
          return;
        }

        // Handle binary messages (audio frames)
        // All binary messages are treated as audio data
        const session = sessions.get(ws);
        if (!session) {
          log(`[audio-stream-ws] Received binary message (${data.length} bytes) but no active session from ${clientInfo}. Sessions map size: ${sessions.size}`);
          // Don't send error response for binary messages - client will retry after sending start
          // Just log it as this might happen during race conditions
          return;
        }

        // Data should be a Buffer at this point
        const audioBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

        try {
          // If we have a decoder (WebM/Opus), decode to PCM first
          if (session.decoder) {
            const pcmBuffer = await session.decoder.decodeChunk(audioBuffer);
            
            if (!pcmBuffer) {
              // Decoder is still processing header or waiting for more data
              // This is normal for WebM - chunks may not contain complete frames
              // The decoder buffers internally and will return PCM when frames are complete
              // Don't log this as an error - it's expected behavior
              return;
            }

            // Send decoded PCM to orchestrator
            const audioBase64 = pcmBuffer.toString('base64');
            const seq = session.seq++;
            const sampleRate = 24000; // OpenAI Realtime API expects 24kHz (decoder resamples from 48kHz)
            const bytesPerSample = session.bytesPerSample || 2; // 16-bit PCM
            
            // Calculate duration in milliseconds: (bytes / (sampleRate * bytesPerSample)) * 1000
            const durationMs = Math.max(1, Math.round((pcmBuffer.length / (sampleRate * bytesPerSample)) * 1000));

            const chunk: TranscriptAudioChunk = {
              audioBase64,
              seq,
              isFinal: false,
              sampleRate,
              bytesPerSample,
              encoding: 'pcm_s16le', // Decoded to PCM
              durationMs,
              speaker: session.speaker, // Pass through speaker from start message
            };

            await orchestrator.appendTranscriptAudio(session.eventId, chunk);
            
            // Log every 10th chunk to avoid spam
            if (seq % 10 === 0) {
              log(`[audio-stream-ws] Processed decoded PCM chunk seq=${seq} for event=${session.eventId}, PCM size=${pcmBuffer.length} bytes (from ${audioBuffer.length} bytes WebM), from=${clientInfo}`);
            }
          } else {
            // No decoder - assume raw PCM or other format, send as-is
            const audioBase64 = audioBuffer.toString('base64');
            const seq = session.seq++;

            // Calculate duration in milliseconds: (bytes / (sampleRate * bytesPerSample)) * 1000
            const sampleRate = session.sampleRate || 24000;
            const bytesPerSample = session.bytesPerSample || 2;
            const durationMs = Math.max(1, Math.round((audioBuffer.length / (sampleRate * bytesPerSample)) * 1000));

            const chunk: TranscriptAudioChunk = {
              audioBase64,
              seq,
              isFinal: false,
              sampleRate,
              bytesPerSample,
              encoding: session.codec,
              durationMs,
              speaker: session.speaker, // Pass through speaker from start message
            };

            await orchestrator.appendTranscriptAudio(session.eventId, chunk);
            
            // Log every 10th chunk to avoid spam
            if (seq % 10 === 0) {
              log(`[audio-stream-ws] Processed audio chunk seq=${seq} for event=${session.eventId}, size=${audioBuffer.length} bytes, from=${clientInfo}`);
            }
          }
        } catch (err) {
          const errorText = String(err);
          log(`[audio-stream-ws] Error processing audio chunk for event=${session.eventId}: ${errorText}`);
          ws.send(JSON.stringify({ ok: false, error: errorText }));
        }
      } catch (err) {
        const errorText = String(err);
        log(`[audio-stream-ws] Error handling message from ${clientInfo}: ${errorText}`);
        ws.send(JSON.stringify({ ok: false, error: 'Internal server error' }));
      }
      })();
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      if (session) {
        // Cleanup decoder
        if (session.decoder) {
          session.decoder.destroy();
        }
        log(`[audio-stream-ws] Connection closed for event=${session.eventId}, from=${clientInfo}`);
        sessions.delete(ws);
      } else {
        log(`[audio-stream-ws] Connection closed from ${clientInfo}`);
      }
    });

    ws.on('error', (err) => {
      log(`[audio-stream-ws] WebSocket error from ${clientInfo}: ${String(err)}`);
      sessions.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      ok: true,
      message: 'Connected to audio stream',
      protocol: 'Send {"type":"start","client":"web","codec":"webm-opus","event_id":"..."} to begin',
    }));
  });

  wss.on('error', (err) => {
    log(`[audio-stream-ws] WebSocketServer error: ${String(err)}`);
  });

  log('[audio-stream-ws] WebSocket server created for /audio/stream');

  return wss;
};

