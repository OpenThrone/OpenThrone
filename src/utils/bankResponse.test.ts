import { describe, expect, it } from 'bun:test';

import { readBankResponse } from '@/utils/bankResponse';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('readBankResponse', () => {
  it('treats an HTML gateway page as unreachable, not a parser error', async () => {
    const res = new Response('<html> <head><title>502 Bad Gateway</title>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });
    expect(await readBankResponse(res)).toEqual({ ok: false, error: null });
  });

  it('passes a server error message through', async () => {
    expect(
      await readBankResponse(json({ error: 'Maximum deposits reached' }, 400)),
    ).toEqual({ ok: false, error: 'Maximum deposits reached' });
  });

  it('treats a non-OK status without an error message as unreachable', async () => {
    expect(await readBankResponse(json({}, 500))).toEqual({
      ok: false,
      error: null,
    });
  });

  it('returns the body on success', async () => {
    expect(await readBankResponse(json({ success: true }))).toEqual({
      ok: true,
      data: { success: true },
    });
  });
});
