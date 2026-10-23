import { processTemporaryForces } from '@/services/ForceWorker.service';
import { logError } from '@/utils/logger';

export function startTemporaryForceWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    try {
      await processTemporaryForces();
    } catch (error) {
      logError(
        'Temporary force processing failed; retrying next minute',
        error,
      );
    }
    if (!stopped) timer = setTimeout(poll, 60000);
  };
  poll().catch(logError);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
