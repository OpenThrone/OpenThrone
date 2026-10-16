// Silences the shared logger for each test in the calling scope.
// Use instead of vi.mock('@/utils/logger', ...) / mock.module(...): Bun keeps module
// mocks process-wide (mock.restore() does not revert them), so a file-level module mock
// leaks into every later test file and breaks suites that depend on the real logger.
// Usage: silenceLogger(); near the top of the describe scope, after the imports.
import { afterEach, beforeEach, vi } from 'bun:test';

import * as logger from '@/utils/logger';

const LOGGER_METHODS = ['logError', 'logWarn', 'logInfo', 'logDebug'] as const;

export function silenceLogger(): void {
  const spies: Array<{ mockRestore: () => void }> = [];

  beforeEach(() => {
    for (const name of LOGGER_METHODS) {
      spies.push(vi.spyOn(logger, name).mockImplementation(() => undefined));
    }
  });

  afterEach(() => {
    for (const spy of spies.splice(0)) {
      spy.mockRestore();
    }
  });
}
