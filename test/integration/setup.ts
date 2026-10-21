/**
 * Refuses to run integration tests against anything but the throwaway
 * database started by scripts/test-integration.sh.
 */
const url = process.env.POSTGRES_PRISMA_URL ?? '';
let host = '';
let database = '';
try {
  const parsed = new URL(url);
  host = parsed.hostname;
  database = parsed.pathname.replace(/^\//, '');
} catch {
  // handled below
}

if (
  process.env.OT_INTEGRATION_DB !== '1' ||
  !['127.0.0.1', 'localhost'].includes(host) ||
  database !== 'ot_integration'
) {
  throw new Error(
    'Integration tests only run against the throwaway database: use scripts/test-integration.sh',
  );
}
