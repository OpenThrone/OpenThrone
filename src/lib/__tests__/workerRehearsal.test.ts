import { describe, expect, it, mock } from 'bun:test';

import { handleRehearsalRequest, withNoIndex } from '@/lib/workerRehearsal';

const env = {
  OT_REHEARSAL_HEALTH_ENABLED: 'true',
  HYPERDRIVE: { connectionString: 'synthetic' },
};
const request = (path: string, method = 'GET') =>
  new Request(`https://rehearsal.example.test${path}`, { method });

describe('production rehearsal readiness operation', () => {
  it('leaves ordinary app traffic and other deployments unchanged', async () => {
    expect(
      await handleRehearsalRequest(
        request('/api/auth/callback/credentials', 'POST'),
        env,
      ),
    ).toBeNull();
    expect(
      await handleRehearsalRequest(request('/__rehearsal/health'), {}),
    ).toBeNull();
  });
  it('refuses other methods before touching the database', async () => {
    const probe = mock(async () => true);
    expect(
      (
        await handleRehearsalRequest(
          request('/__rehearsal/health', 'POST'),
          env,
          probe,
        )
      )?.status,
    ).toBe(405);
    expect(probe).not.toHaveBeenCalled();
  });
  it('reports only readiness, never database identifiers or records', async () => {
    const result = await handleRehearsalRequest(
      request('/__rehearsal/health'),
      env,
      async () => true,
    );
    expect(result?.status).toBe(200);
    expect(await result?.json()).toEqual({ ready: true });
    expect(result?.headers.get('Cache-Control')).toBe('no-store');
  });
  it('fails closed without a binding or when the database fails, hiding error details', async () => {
    const failed = await handleRehearsalRequest(
      request('/__rehearsal/health'),
      env,
      async () => {
        throw new Error('sensitive connection details');
      },
    );
    expect(failed?.status).toBe(503);
    expect(await failed?.text()).not.toContain('sensitive');
    expect(
      (
        await handleRehearsalRequest(request('/__rehearsal/health'), {
          OT_REHEARSAL_HEALTH_ENABLED: 'true',
        })
      )?.status,
    ).toBe(503);
  });
});

describe('withNoIndex', () => {
  it('marks every response noindex on a production mirror (stage)', async () => {
    const original = new Response('<html></html>', {
      status: 201,
      headers: { 'Content-Type': 'text/html' },
    });
    const marked = withNoIndex(original, { OT_NOINDEX: 'true' });
    expect(marked.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(marked.headers.get('Content-Type')).toBe('text/html');
    expect(marked.status).toBe(201);
    expect(await marked.text()).toBe('<html></html>');
  });

  it('works on responses whose headers are immutable', () => {
    const immutable = Response.redirect('https://stage.openthrone.dev/', 302);
    const marked = withNoIndex(immutable, { OT_NOINDEX: 'true' });
    expect(marked.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(marked.headers.get('Location')).toBe(
      'https://stage.openthrone.dev/',
    );
  });

  it('leaves responses unchanged when the flag is off (production)', () => {
    const original = new Response('ok');
    expect(withNoIndex(original, {})).toBe(original);
    expect(withNoIndex(original, { OT_NOINDEX: 'false' })).toBe(original);
  });
});
