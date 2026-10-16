import { startEraResetWorker } from '@/server/eraResetWorker';

const stop = startEraResetWorker();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stop();
    process.exit(0);
  });
}
