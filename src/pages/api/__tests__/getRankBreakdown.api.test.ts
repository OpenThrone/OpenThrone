import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));

const handler = require('../utilities/getRankBreakdown').default;

describe('API utilities/getRankBreakdown', () => {
  beforeEach(() => resetMockPrisma());

  it('returns combined users and ranks', async () => {
    const req: any = { method: 'GET', session: { user: { id: 1 } } };
    const mockUsers = [
      {
        id: 1,
        display_name: 'a',
        experience: 10,
        house_level: 1,
        fort_level: 1,
        UserUnit: [
          {
            id: 0,
            userId: 1,
            type: 'CITIZEN',
            level: 1,
            quantity: 5,
            isMercenary: false,
          },
        ],
        UserItem: [],
        items: [],
        units: [
          {
            id: 0,
            userId: 1,
            type: 'CITIZEN',
            level: 1,
            quantity: 5,
            isMercenary: false,
          },
        ],
      },
      {
        id: 2,
        display_name: 'b',
        experience: 20,
        house_level: 1,
        fort_level: 1,
        UserUnit: [
          {
            id: 0,
            userId: 2,
            type: 'CITIZEN',
            level: 1,
            quantity: 10,
            isMercenary: false,
          },
        ],
        UserItem: [],
        items: [],
        units: [
          {
            id: 0,
            userId: 2,
            type: 'CITIZEN',
            level: 1,
            quantity: 10,
            isMercenary: false,
          },
        ],
      },
    ];
    mockPrisma.users.findMany = vi.fn().mockResolvedValue(mockUsers);
    const json = vi.fn();
    const res: any = { getHeader: () => undefined, status: () => ({ json }) };
    await handler(req, res);
    expect(json).toHaveBeenCalled();
    const resp = json.mock.calls[0][0];
    expect(resp.users.length).toBe(2);
  });
});

const noopHandler = (req: any, res: any) => {};

export default noopHandler;
