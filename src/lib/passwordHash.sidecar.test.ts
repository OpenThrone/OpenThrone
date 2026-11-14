import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';

// Hermetic mock: heavy-hash verification is offloaded to the ARGON2_VERIFY
// service binding when one is present. The mock stands in for the sidecar
// and echoes whatever verdict we script; bun module mocks are process-wide,
// so this lives in its own file to keep the real-argon2 vector tests clean.
const sidecarFetch = vi.fn(
  async (_input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      hash?: string;
      password?: string;
    };
    // Minimal stand-in semantics: a sentinel password "sidecar-reject" fails.
    const ok = body.password !== 'sidecar-reject';
    return new Response(JSON.stringify({ ok }), { status: 200 });
  },
);

// The env is read per call, so each test sets it here instead of re-mocking
// the module: a second mock.module would leak into whichever test runs next
// under --randomize (the sidecar test then saw no binding and 0 calls).
let mockEnv: Record<string, unknown> = {};
mock.module('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: mockEnv }),
}));

const { verifyPassword } = await import('./passwordHash');

// Native-default parameters (m=65536) — above the offload threshold.
const HEAVY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$/9POCpSv4NEpyPJmPtYXYw$n78K/HnhPNxoWdQfsZICVqZTAAaKexXmC4ednYOQ0Hk';

describe('heavy hashes route through the argon2 sidecar', () => {
  beforeEach(() => {
    sidecarFetch.mockClear();
    mockEnv = { ARGON2_VERIFY: { fetch: sidecarFetch } };
  });

  it('sends m>=32768 hashes to the binding and honors its verdict', async () => {
    expect(await verifyPassword(HEAVY_HASH, 'openthrone-test-1')).toBe(true);
    expect(await verifyPassword(HEAVY_HASH, 'sidecar-reject')).toBe(false);

    expect(sidecarFetch).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(
      String((sidecarFetch.mock.calls[0][1] as RequestInit).body),
    ) as { hash: string; password: string };
    expect(sent).toEqual({ hash: HEAVY_HASH, password: 'openthrone-test-1' });
  });

  it('falls back to local verification when the binding is absent', async () => {
    mockEnv = {};
    expect(await verifyPassword(HEAVY_HASH, 'openthrone-test-1')).toBe(true);
    expect(await verifyPassword(HEAVY_HASH, 'wrong-password')).toBe(false);
    expect(sidecarFetch).not.toHaveBeenCalled();
  });
});
