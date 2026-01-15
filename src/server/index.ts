import { createServer } from 'http';
import { isIP } from 'net';
import next from 'next';

import { initializeSocket } from '@/lib/socket';
import { logInfo } from '@/utils/logger';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT, 10) || 3000;

// Initialize Next.js with hostname and port
const app = next({
  dev,
  turbo: true,
  turbopack: true,
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

  // Conditionally log the hostname with or without the port
  httpServer.listen(port, () => {
    if (hostname === 'localhost' || isIP(hostname)) {
      logInfo(`> Server ready on http://${hostname}:${port}`);
    } else {
      logInfo(`> Server ready on https://${hostname}`);
    }
  });
})();
