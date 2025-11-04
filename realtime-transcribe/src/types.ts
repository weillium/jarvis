/**
 * Type definitions for the Realtime Transcription Service
 */

export interface ClientMessage {
  type: 'audio' | 'ping' | 'close';
  data?: string | Buffer;
}

export interface ServerMessage {
  type: 'transcript' | 'error' | 'connected' | 'pong';
  text?: string;
  timestamp?: string;
  error?: string;
}

export interface SessionData {
  eventId: string;
  sessionId: string;
  startTime: Date;
  transcriptCount: number;
}



