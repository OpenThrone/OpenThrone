import { processScheduledEraReset } from '@/services/EraResetSchedule.service';
import { logError } from '@/utils/logger';

/** One sequential poll per process; PostgreSQL coordinates multiple processes. */
export function startEraResetWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    let delay = 1000;
    try {
      await processScheduledEraReset();
    } catch (error) {
      logError(
        'Scheduled era reset failed; retrying with player logins closed if reset started',
        error,
      );
      delay = 15_000;
    }
    if (!stopped) timer = setTimeout(poll, delay);
  };
  poll().catch((error) =>
    logError('Era reset worker stopped unexpectedly', error),
  );
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
