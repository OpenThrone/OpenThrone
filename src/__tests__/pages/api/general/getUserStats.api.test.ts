import { describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
const route =
  require('../../../../pages/api/general/getUserStats/[id]').default;

describe('private player stats authorization', () => {
  it('does not give synthetic IDs 1 and 2 access to other player loadouts', async () => {
    for (const actorId of [1, 2, '1', '2', 7]) {
      mockPrisma.users.findUnique.mockClear();
      const res = { status: vi.fn(), json: vi.fn() };
      res.status.mockReturnValue(res);
      await route(
        { query: { id: '9' }, session: { user: { id: actorId } } },
        res,
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
    }
  });
});
