import { defineConfig } from 'prisma/config';

// Code-only config: integration checks must never load the project's env files.
const url = process.env.POSTGRES_URL_NON_POOLING ?? '';
let target: URL | null = null;
try {
  target = url ? new URL(url) : null;
} catch {
  target = null;
}
if (
  process.env.OT_INTEGRATION_DB !== '1' ||
  !target ||
  !['127.0.0.1', 'localhost'].includes(target.hostname) ||
  target.pathname !== '/ot_integration'
) {
  throw new Error(
    'Use scripts/test-integration.sh with its throwaway database',
  );
}

export default defineConfig({
  schema: './schema.prisma',
  migrations: { path: './migrations' },
  datasource: { url },
});
