import WebSocket from 'ws';
import fs from 'fs';
const WS_URL = process.env.WS_URL || 'ws://localhost:8080/ws/transcript?jwt=dev';
const EVENT_ID = process.env.EVENT_ID || 'sample';
const ws = new WebSocket(WS_URL);
ws.on('open', () => {
  const lines = fs.readFileSync('dev/sample_transcript.ndjson','utf8').trim().split('\n');
  let t = 0;
  const tick = () => {
    if (!lines.length) return ws.close();
    const obj = JSON.parse(lines.shift()!);
    obj.event_id = EVENT_ID;
    ws.send(JSON.stringify(obj));
    setTimeout(tick, 300);
  };
  tick();
});
