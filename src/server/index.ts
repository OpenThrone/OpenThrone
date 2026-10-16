import { createServer } from 'http';
import { isIP } from 'net';
import next from 'next';

import { initializeSocket } from '@/lib/socket';
import { startEmailOutboxWorker } from '@/server/emailOutboxWorker';
import { startEraResetWorker } from '@/server/eraResetWorker';
import { missingEmailSecrets } from '@/utils/emailSecrets';
import { logError, logInfo } from '@/utils/logger';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT, 10) || 3000;

// Initialize Next.js with hostname and port
const useTurbopack = process.env.USE_TURBOPACK === 'true';
const app = next({
  dev,
  ...(useTurbopack ? { turbo: true } : { webpack: true }),
  hostname,
  port,
});

const handle = app.getRequestHandler();

(async () => {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // Initialize Socket.IO
  initializeSocket(httpServer);
  const stopEraResetWorker = startEraResetWorker();
  httpServer.once('close', stopEraResetWorker);
  const missing = missingEmailSecrets();
  if (missing.length)
    logError(`Email configuration missing: ${missing.join(', ')}`);
  if (!missing.length) {
    const stopEmailOutboxWorker = startEmailOutboxWorker();
    httpServer.once('close', stopEmailOutboxWorker);
  }

  // Conditionally log the hostname with or without the port
  httpServer.listen(port, () => {
    if (hostname === 'localhost' || isIP(hostname)) {
      logInfo(`> Server ready on http://${hostname}:${port}`);
    } else {
      logInfo(`> Server ready on https://${hostname}`);
    }
  });
})();
