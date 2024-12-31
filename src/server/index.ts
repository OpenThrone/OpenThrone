import next from 'next';
import { createServer } from 'http';
import { initializeSocket } from '@/lib/socket';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, turbo: true, turbopack: true, hostname: 'alpha.openthrone.dev', port: 3000 });
const handle = app.getRequestHandler();

(async () => {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res); // Handle other requests with Next.js
  });

  // Initialize Socket.IO
  initializeSocket(httpServer);

  httpServer.listen(3000, () => {
    console.log('> Server ready on https://alpha.openthrone.dev');
  });
})();
