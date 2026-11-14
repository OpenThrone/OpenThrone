import { Client } from 'pg';

export interface RehearsalEnv {
  OT_REHEARSAL_HEALTH_ENABLED?: string;
  /** "true" on mirrors of production (stage) so search engines skip them. */
  OT_NOINDEX?: string;
  HYPERDRIVE?: { connectionString: string };
}

/** A fixed operation with a read-only transaction; never returns database rows or errors. */
export async function probeRehearsalDatabase(connectionString: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await client.query<{ ready: boolean }>(`
      SELECT to_regclass('public.users') IS NOT NULL
        AND to_regclass('public."ServerSetting"') IS NOT NULL
        AND to_regclass('public."EmailOutbox"') IS NOT NULL AS ready
    `);
    await client.query('ROLLBACK');
    return result.rows[0]?.ready === true;
  } finally {
    await client.end();
  }
}

/** Fixed readiness operation for the production-connected rehearsal; app traffic is unchanged. */
export async function handleRehearsalRequest(
  request: Request,
  env: RehearsalEnv,
  probe = probeRehearsalDatabase,
): Promise<Response | null> {
  if (
    env.OT_REHEARSAL_HEALTH_ENABLED !== 'true' ||
    new URL(request.url).pathname !== '/__rehearsal/health'
  )
    return null;
  const headers = {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  if (request.method !== 'GET')
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { ...headers, Allow: 'GET' } },
    );
  try {
    const ready = env.HYPERDRIVE
      ? await probe(env.HYPERDRIVE.connectionString)
      : false;
    return Response.json({ ready }, { status: ready ? 200 : 503, headers });
  } catch {
    return Response.json({ ready: false }, { status: 503, headers });
  }
}

/**
 * Marks every response from a production mirror as not indexable, so
 * stage.openthrone.dev never competes with openthrone.dev in search results.
 * Responses pass through unchanged unless OT_NOINDEX is "true".
 */
export function withNoIndex(response: Response, env: RehearsalEnv): Response {
  if (env.OT_NOINDEX !== 'true') return response;
  // Fetched and cached responses can carry immutable headers; copy them.
  const marked = new Response(response.body, response);
  marked.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return marked;
}
