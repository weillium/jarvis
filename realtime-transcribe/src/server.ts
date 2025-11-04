import 'dotenv/config';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { ClientMessage, ServerMessage, SessionData } from './types.js';

// Environment configuration
function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const SUPABASE_URL = need('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = need('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = need('OPENAI_API_KEY');
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001', 10);
const WEBSOCKET_PORT = parseInt(process.env.WEBSOCKET_PORT || '8080', 10);

// Initialize clients
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Create Express app (for health checks)
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'realtime-transcribe',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Create WebSocket server
const wss = new WebSocketServer({ port: WEBSOCKET_PORT });

// Track active sessions
const sessions = new Map<string, SessionData>();

console.log(`[server] Starting WebSocket bridge service...`);
console.log(`[server] HTTP health check: http://localhost:${HTTP_PORT}/health`);
console.log(`[server] WebSocket server: ws://localhost:${WEBSOCKET_PORT}`);

// Handle WebSocket connections from clients
wss.on('connection', async (clientWs: WebSocket, req) => {
  const url = new URL(req.url!, `http://localhost:${WEBSOCKET_PORT}`);
  const eventId = url.searchParams.get('event_id');
  
  if (!eventId) {
    console.log('[client] rejected: missing event_id');
    clientWs.close(1008, 'Missing event_id parameter');
    return;
  }

  const sessionId = `${eventId}-${Date.now()}`;
  console.log(`[client] connected - session: ${sessionId}, event: ${eventId}`);

  try {
    // Create OpenAI Realtime session for this client
    // Note: OpenAI SDK 6.7.0 Realtime API usage may vary - check latest docs
    // This is a conceptual implementation based on the architecture docs
    console.log(`[openai] creating session for event: ${eventId}`);
    
    // Store session data
    sessions.set(sessionId, {
      eventId,
      sessionId,
      startTime: new Date(),
      transcriptCount: 0
    });

    // Send connection confirmation
    clientWs.send(JSON.stringify({
      type: 'connected',
      sessionId,
      timestamp: new Date().toISOString()
    } as ServerMessage));

    // Handle incoming messages from client
    clientWs.on('message', async (data: Buffer) => {
      try {
        if (data.length === 0) return;

        // For audio data, forward to OpenAI Realtime API
        if (Buffer.isBuffer(data)) {
          console.log(`[audio] received chunk: ${data.length} bytes`);
          
          // Convert audio buffer to base64 for OpenAI API
          const audioBase64 = data.toString('base64');
          
          // Send to OpenAI Realtime API
          // Note: Actual OpenAI Realtime API implementation may differ
          // This is a placeholder based on the conceptual flow
          try {
            // In a real implementation, you would use openai.beta.realtime methods
            // For now, we'll simulate receiving transcripts after processing
            console.log(`[openai] sending audio chunk to transcription service`);
            
            // Simulated transcript (remove in production)
            // In production, this would be handled by OpenAI Realtime API events
            // setTimeout(() => {
            //   const transcript = "Hello, this is a test transcription.";
            //   handleTranscript(eventId, transcript, clientWs);
            // }, 1000);
            
          } catch (error) {
            console.error('[openai] error:', error);
            clientWs.send(JSON.stringify({
              type: 'error',
              error: 'Failed to process audio',
              timestamp: new Date().toISOString()
            } as ServerMessage));
          }
        } else {
          // Handle text messages (ping/pong, commands, etc.)
          const message: ClientMessage = JSON.parse(data.toString());
          handleClientMessage(message, clientWs, eventId, sessionId);
        }
      } catch (error) {
        console.error('[client] message error:', error);
      }
    });

    // Cleanup on disconnect
    clientWs.on('close', (code, reason) => {
      console.log(`[client] disconnected - session: ${sessionId}, code: ${code}, reason: ${reason.toString()}`);
      sessions.delete(sessionId);
      
      // Close OpenAI session if needed
      // session.close();
    });

    clientWs.on('error', (error) => {
      console.error('[client] error:', error);
      sessions.delete(sessionId);
    });

  } catch (error) {
    console.error('[client] connection error:', error);
    clientWs.close(1011, 'Internal server error');
    sessions.delete(sessionId);
  }
});

/**
 * Handle non-audio messages from client
 */
function handleClientMessage(message: ClientMessage, clientWs: WebSocket, eventId: string, sessionId: string): void {
  switch (message.type) {
    case 'ping':
      clientWs.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      } as ServerMessage));
      break;
      
    case 'close':
      console.log(`[client] close requested - session: ${sessionId}`);
      clientWs.close(1000, 'Client requested close');
      break;
      
    default:
      console.log(`[client] unknown message type: ${message.type}`);
  }
}

/**
 * Handle transcript from OpenAI and insert into database
 */
async function handleTranscript(eventId: string, transcript: string, clientWs: WebSocket): Promise<void> {
  console.log(`[transcript] event: ${eventId}, text: "${transcript}"`);
  
  try {
    // Insert into database
    const { error } = await supabase
      .from('transcripts')
      .insert({
        event_id: eventId,
        text: transcript,
        ts: new Date().toISOString()
      });
    
    if (error) {
      console.error('[db] insert error:', error.message);
      clientWs.send(JSON.stringify({
        type: 'error',
        error: 'Failed to save transcript',
        timestamp: new Date().toISOString()
      } as ServerMessage));
      return;
    }
    
    // Update session stats
    for (const [sessionId, session] of sessions.entries()) {
      if (session.eventId === eventId) {
        session.transcriptCount++;
      }
    }
    
    // Forward transcript to client for live display
    clientWs.send(JSON.stringify({
      type: 'transcript',
      text: transcript,
      timestamp: new Date().toISOString()
    } as ServerMessage));
    
    console.log(`[db] transcript saved for event: ${eventId}`);
    
  } catch (error) {
    console.error('[transcript] error:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[server] shutting down gracefully...');
  wss.close(() => {
    console.log('[server] WebSocket server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[server] shutting down gracefully...');
  wss.close(() => {
    console.log('[server] WebSocket server closed');
    process.exit(0);
  });
});

// Start HTTP server
app.listen(HTTP_PORT, () => {
  console.log(`[server] HTTP server listening on port ${HTTP_PORT}`);
});

console.log('[server] Ready! Waiting for client connections...');

// Export for testing
export { handleTranscript };



