import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));
// Mock isAdmin to avoid dependency on prisma.permissionGrant in auth
mock.module('@/utils/authorization', () => ({ isAdmin: async () => true }));

const adminHandler = require('../admin/users/[userId].ts').default;

describe('API admin/users', () => {
  beforeEach(() => resetMockPrisma());

  it('GET returns formatted user response', async () => {
    const req: any = {
      method: 'GET',
      session: { user: { id: 1 } },
      query: { userId: '1' },
    };
    const mockUser = {
      id: 1,
      display_name: 'bob',
      email: 'b@b.com',
      gold: 100,
      gold_in_bank: 10,
      UserUnit: [
        {
          id: 0,
          userId: 1,
          type: 'CITIZEN',
          level: 1,
          quantity: 10,
          isMercenary: false,
        },
      ],
      UserItem: [
        {
          id: 0,
          userId: 1,
          type: 'SWORD',
          level: 1,
          quantity: 1,
          usage: 'GENERAL',
        },
      ],
      permissions: [],
      units: [{ type: 'CITIZEN', level: 1, quantity: 10 }],
      items: [{ type: 'SWORD', level: 1, quantity: 1, usage: 'GENERAL' }],
    };
    mockPrisma.users.findUnique = vi.fn().mockResolvedValue(mockUser);
    const json = vi.fn();
    const res: any = { getHeader: () => undefined, status: () => ({ json }) };
    await adminHandler(req, res);
    expect(json).toHaveBeenCalled();
    const resp = json.mock.calls[0][0];
    expect(resp.army.units.length).toBe(1);
  });
});

const noopHandler = (req: any, res: any) => {};

export default noopHandler;
