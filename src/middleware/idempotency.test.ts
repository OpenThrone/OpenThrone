import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

import { enforceIdempotency } from './idempotency';

installMockPrisma(vi);

describe('idempotency middleware', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.antiAbuseShadow.create = vi.fn().mockResolvedValue({ id: 1 });
  });

  it('allows request when key is unique', async () => {
    const req: any = {
      headers: { 'idempotency-key': 'abc123' },
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    const ok = await enforceIdempotency(req, res, {
      scope: 'attack:1',
      actorKey: '99',
    });

    expect(ok).toBe(true);
    expect(mockPrisma.antiAbuseShadow.create).toHaveBeenCalledTimes(1);
  });

  it('rejects request when key is missing', async () => {
    const req: any = { headers: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    const ok = await enforceIdempotency(req, res, {
      scope: 'attack:1',
      actorKey: '99',
    });

    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects duplicate key with conflict', async () => {
    mockPrisma.antiAbuseShadow.create = vi
      .fn()
      .mockRejectedValue({ code: 'P2002' });

    const req: any = {
      headers: { 'idempotency-key': 'abc123' },
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    const ok = await enforceIdempotency(req, res, {
      scope: 'attack:1',
      actorKey: '99',
    });

    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
