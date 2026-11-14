import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
  vi,
} from 'bun:test';
import fs from 'fs';
import path from 'path';

import { AccountService } from '@/services/Account.service';

vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
// Account service is spied per test rather than mocked at module level: module mocks
// are process-wide in Bun and would replace '@/services' for every later test file.
const handler = require('../../../../pages/api/account/profile').default;

// A real 1x1 PNG, so the in-memory parser and image decoder run unmocked.
const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

/** Encodes a real multipart body and wraps it as the Node request the route reads. */
const makeReq = async (
  fields: Record<string, string>,
  file?: { name: string; bytes: Uint8Array },
) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file) form.append('avatar', new Blob([file.bytes]), file.name);
  // Under Bun only a Response exposes the generated boundary header, and only
  // until its body is read: capture it first.
  const encoded = new Response(form);
  const contentType = encoded.headers.get('content-type');
  const body = new Uint8Array(await encoded.arrayBuffer());
  return {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'content-length': String(body.byteLength),
    },
    session: { user: { id: 125 } },
    async *[Symbol.asyncIterator]() {
      yield body;
    },
  };
};

const post = async (
  fields: Record<string, string>,
  file?: { name: string; bytes: Uint8Array },
) => {
  const res = makeRes();
  await handler(await makeReq(fields, file), res);
  return res;
};

const TRAVERSAL_NAME = '../../../../../etc/cron.d/evil.png';

describe('avatar upload storage name', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let savedUseAws: string | undefined;

  beforeEach(() => {
    // Pin local-disk storage: other suites can leave NEXT_PUBLIC_USE_AWS set.
    savedUseAws = process.env.NEXT_PUBLIC_USE_AWS;
    process.env.NEXT_PUBLIC_USE_AWS = 'false';
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
    writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    spyOn(AccountService, 'updateProfile').mockResolvedValue({
      id: 125,
      bio: 'Hello',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedUseAws === undefined) delete process.env.NEXT_PUBLIC_USE_AWS;
    else process.env.NEXT_PUBLIC_USE_AWS = savedUseAws;
  });

  it('ignores a traversal filename and stores the file under a server-generated name', async () => {
    const res = await post(
      { bio: 'Hello' },
      { name: TRAVERSAL_NAME, bytes: PNG_BYTES },
    );

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const [to, written] = writeSpy.mock.calls[0] as [string, Uint8Array];
    expect(Array.from(written)).toEqual(Array.from(PNG_BYTES));

    const avatarDir = path.join(process.cwd(), 'public', 'users/125/avatar');
    expect(path.dirname(to)).toBe(avatarDir);
    expect(path.basename(to)).toMatch(/^125-[a-f0-9]{32}\.png$/);
    expect(to).not.toContain('etc');
    expect(to).not.toContain('..');
    expect(to).not.toContain('evil');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(AccountService.updateProfile).toHaveBeenCalledWith(125, {
      bio: 'Hello',
      avatarFile: `/users/125/avatar/${path.basename(to)}`,
    });
  });

  it('derives the same stored name from identical content regardless of the client filename', async () => {
    const names: string[] = [];
    for (const name of ['a.png', 'totally-different.png']) {
      writeSpy.mockClear();
      await post({}, { name, bytes: PNG_BYTES });
      names.push(path.basename(writeSpy.mock.calls[0][0] as string));
    }
    expect(names[0]).toBe(names[1]);
  });

  it('rejects bytes that do not decode as an image', async () => {
    const res = await post(
      {},
      { name: 'fake.png', bytes: new TextEncoder().encode('not an image') },
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Uploaded file is not a valid image.',
    });
    expect(writeSpy).not.toHaveBeenCalled();
    expect(AccountService.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects a disallowed filename extension before decoding', async () => {
    const res = await post({}, { name: 'avatar.svg', bytes: PNG_BYTES });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('rejects uploads over 1.5 MB with a clear message', async () => {
    const res = await post(
      {},
      { name: 'big.png', bytes: new Uint8Array(2 * 1024 * 1024) },
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Image files must be at most 1.5 MB.',
    });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('rejects a body that is not multipart', async () => {
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        session: { user: { id: 125 } },
        async *[Symbol.asyncIterator]() {
          yield new TextEncoder().encode('{}');
        },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid upload' });
  });
});

describe('avatar framing', () => {
  beforeEach(() => {
    spyOn(AccountService, 'updateProfile').mockResolvedValue({
      id: 125,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a framing on its own and clamps it', async () => {
    const res = await post({
      avatarFraming: JSON.stringify({ x: 120, y: 30, zoom: 1.5 }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(AccountService.updateProfile).toHaveBeenCalledWith(125, {
      bio: undefined,
      avatarFile: undefined,
      avatarFraming: { x: 100, y: 30, zoom: 1.5 },
    });
  });

  it('passes null to clear the framing on reset', async () => {
    await post({ avatarFraming: 'reset' });
    expect(AccountService.updateProfile).toHaveBeenCalledWith(125, {
      bio: undefined,
      avatarFile: undefined,
      avatarFraming: null,
    });
  });

  it('rejects malformed framing without touching the profile', async () => {
    for (const avatarFraming of ['{not json', '{"x":"1","y":2,"zoom":1}']) {
      const res = await post({ avatarFraming });
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(AccountService.updateProfile).not.toHaveBeenCalled();
  });
});
