import next from 'next';
import { createServer } from 'http';
import { initializeSocket } from '@/lib/socket';
import { isIP } from 'net';

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
      console.log(`> Server ready on http://${hostname}:${port}`);
    } else {
      console.log(`> Server ready on https://${hostname}`);
    }
  });
})();
