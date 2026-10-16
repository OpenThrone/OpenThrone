import { startEmailOutboxWorker } from '@/server/emailOutboxWorker';

const stop = startEmailOutboxWorker();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stop();
    process.exit(0);
  });
}
