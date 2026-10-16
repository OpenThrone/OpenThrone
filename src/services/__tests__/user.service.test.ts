import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Require module under test after mocks installed
const userService = require('../User.service');

const { userExists } = userService;

describe('user.service', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  it('userExists calls prisma.count and returns number', async () => {
    mockPrisma.users.count = vi.fn().mockResolvedValue(2);
    const res = await userExists('test@example.com');
    expect(res).toBe(2);
    expect(mockPrisma.users.count).toHaveBeenCalled();
  });

  it('userExists checks a separate display name when provided', async () => {
    mockPrisma.users.count = vi.fn().mockResolvedValue(1);
    await userExists('test@example.com', 'Commander');

    expect(mockPrisma.users.count).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            email: {
              equals: 'test@example.com',
              mode: 'insensitive',
            },
          },
          {
            display_name: {
              equals: 'Commander',
              mode: 'insensitive',
            },
          },
        ],
      },
    });
  });
});
