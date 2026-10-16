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
import os from 'os';
import path from 'path';

import { AccountService } from '@/services/Account.service';

// Synthetic upload state consumed by the mocked formidable parser.
const upload = {
  fields: {} as Record<string, unknown>,
  files: {} as Record<string, unknown>,
  pending: undefined as Promise<unknown> | undefined,
};
vi.mock('formidable', () => ({
  default: () => ({
    uploadDir: '',
    keepExtensions: false,
    parse: (_req: unknown, cb: (...args: unknown[]) => unknown) => {
      upload.pending = Promise.resolve(cb(null, upload.fields, upload.files));
    },
  }),
}));
vi.mock('image-size', () => ({
  default: () => ({ width: 100, height: 100, type: 'png' }),
}));
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
// Account service is spied per test rather than mocked at module level: module mocks
// are process-wide in Bun and would replace '@/services' for every later test file.
const handler = require('../../../../pages/api/account/profile').default;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

const TRAVERSAL_NAME = '../../../../../etc/cron.d/evil.png';

describe('avatar upload storage name', () => {
  let tmpDir: string;
  let uploadedFile: string;
  let renameSpy: ReturnType<typeof vi.spyOn>;
  let savedUseAws: string | undefined;

  beforeEach(() => {
    // Pin local-disk storage: other suites can leave NEXT_PUBLIC_USE_AWS set.
    savedUseAws = process.env.NEXT_PUBLIC_USE_AWS;
    process.env.NEXT_PUBLIC_USE_AWS = 'false';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'));
    uploadedFile = path.join(tmpDir, 'upload.tmp');
    fs.writeFileSync(uploadedFile, 'synthetic image bytes');
    upload.fields = { bio: 'Hello' };
    upload.files = {
      avatar: {
        filepath: uploadedFile,
        originalFilename: TRAVERSAL_NAME,
        size: 22,
      },
    };
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    renameSpy = vi.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
    spyOn(AccountService, 'updateProfile').mockResolvedValue({
      id: 125,
      bio: 'Hello',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedUseAws === undefined) delete process.env.NEXT_PUBLIC_USE_AWS;
    else process.env.NEXT_PUBLIC_USE_AWS = savedUseAws;
  });

  it('ignores a traversal filename and stores the file under a server-generated name', async () => {
    const res = makeRes();
    await handler(
      { method: 'POST', headers: {}, session: { user: { id: 125 } } },
      res,
    );
    await upload.pending;

    expect(renameSpy).toHaveBeenCalledTimes(1);
    const [from, to] = renameSpy.mock.calls[0] as [string, string];
    expect(from).toBe(uploadedFile);

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
    for (const originalFilename of ['a.png', 'totally-different.png']) {
      upload.files = {
        avatar: { filepath: uploadedFile, originalFilename, size: 22 },
      };
      renameSpy.mockClear();
      await handler(
        { method: 'POST', headers: {}, session: { user: { id: 125 } } },
        makeRes(),
      );
      await upload.pending;
      names.push(path.basename(renameSpy.mock.calls[0][1] as string));
    }
    expect(names[0]).toBe(names[1]);
  });
});

describe('avatar framing', () => {
  const post = async () => {
    const res = makeRes();
    await handler(
      { method: 'POST', headers: {}, session: { user: { id: 125 } } },
      res,
    );
    await upload.pending;
    return res;
  };

  beforeEach(() => {
    upload.files = {};
    spyOn(AccountService, 'updateProfile').mockResolvedValue({
      id: 125,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a framing on its own and clamps it', async () => {
    upload.fields = {
      avatarFraming: JSON.stringify({ x: 120, y: 30, zoom: 1.5 }),
    };
    const res = await post();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(AccountService.updateProfile).toHaveBeenCalledWith(125, {
      bio: undefined,
      avatarFile: undefined,
      avatarFraming: { x: 100, y: 30, zoom: 1.5 },
    });
  });

  it('passes null to clear the framing on reset', async () => {
    upload.fields = { avatarFraming: 'reset' };
    await post();
    expect(AccountService.updateProfile).toHaveBeenCalledWith(125, {
      bio: undefined,
      avatarFile: undefined,
      avatarFraming: null,
    });
  });

  it('rejects malformed framing without touching the profile', async () => {
    for (const avatarFraming of ['{not json', '{"x":"1","y":2,"zoom":1}']) {
      upload.fields = { avatarFraming };
      const res = await post();
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(AccountService.updateProfile).not.toHaveBeenCalled();
  });
});
