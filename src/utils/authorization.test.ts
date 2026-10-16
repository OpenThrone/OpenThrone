import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

const { isAdmin, isModerator } = require('./authorization');

const ADMINISTRATOR_ROLE = 'ADMINISTRATOR';
const MODERATOR_ROLE = 'MODERATOR';

describe('authorization utils', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  it('isAdmin returns true when administrator role exists', async () => {
    mockPrisma.staffRoleAssignment.findFirst = vi
      .fn()
      .mockResolvedValue({ id: 10, userId: 5, role: ADMINISTRATOR_ROLE });

    const result = await isAdmin(5);
    expect(result).toBe(true);
    expect(mockPrisma.staffRoleAssignment.findFirst).toHaveBeenCalledWith({
      where: { userId: 5, role: ADMINISTRATOR_ROLE, revokedAt: null },
    });
  });

  it('isModerator returns false when moderator role does not exist', async () => {
    mockPrisma.staffRoleAssignment.findFirst = vi.fn().mockResolvedValue(null);

    const result = await isModerator(7);
    expect(result).toBe(false);
    expect(mockPrisma.staffRoleAssignment.findFirst).toHaveBeenCalledWith({
      where: { userId: 7, role: MODERATOR_ROLE, revokedAt: null },
    });
  });
});
