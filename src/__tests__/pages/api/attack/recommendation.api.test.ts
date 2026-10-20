import { describe, expect, it, vi } from 'bun:test';
import { installMockPrisma } from 'test/utils/mockPrisma';

import * as guard from '@/middleware/apiGuard';

installMockPrisma(vi);

const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    () => (handler: any) => async (req: any, res: any) => handler(req, res, {}),
  );

require('@/pages/api/attack/[id]/recommendation');

const guardOptions = guardSpy.mock.calls.map((call) => call[0]);
guardSpy.mockRestore();

describe('attack recommendation endpoint', () => {
  it('uses a read budget separate from attack submissions', () => {
    expect(guardOptions[0]).toMatchObject({
      methods: ['GET'],
      authMode: 'required',
      rateLimitProfile: 'attack_read',
    });
  });
});
