import 'dotenv/config';
import './bootstrap/logging';
import { loadWorkerEnv } from './bootstrap/env';
import { startWorker } from './server/run-worker';

async function main() {
  try {
    const env = loadWorkerEnv();
    const runtime = await startWorker(env);

    let shuttingDown = false;

    const handleShutdown = (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      console.log('[shutdown]', signal, 'received');
      runtime
        .stop()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          console.error('[shutdown] error:', String(err));
          process.exit(1);
        });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (err: unknown) {
    console.error('[worker] error:', String(err));
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('[fatal]', String(err));
  process.exit(1);
});
