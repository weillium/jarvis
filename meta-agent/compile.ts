import fs from 'fs';
import path from 'path';
// Stub: create minimal bundle structure for sample
const eventId = process.argv[2] || 'sample';
const dir = path.join('bundles', eventId);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir,'event_rules.yaml'), 'cooldown_s: 20\nmerge_window_ms: 1500\n');
fs.writeFileSync(path.join(dir,'manifest.json'), JSON.stringify({version:'1.0.0', schema_date:'2025-10-26', sqlite:'event_context.sqlite', vectors:'embeddings.index', rules:'event_rules.yaml'}, null, 2));
console.log('bundle ready at', dir);
