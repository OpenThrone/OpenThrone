import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

const { isAdmin, isModerator } = require('./authorization');

describe('authorization utils', () => {
  beforeEach(() => {
    resetMockPrisma();
  });

  it('isAdmin returns true when admin permission exists', async () => {
    mockPrisma.permissionGrant.findFirst = vi
      .fn()
      .mockResolvedValue({ id: 10, user_id: 5, type: 'ADMINISTRATOR' });

    const result = await isAdmin(5);
    expect(result).toBe(true);
    expect(mockPrisma.permissionGrant.findFirst).toHaveBeenCalledWith({
      where: { user_id: 5, type: 'ADMINISTRATOR' },
    });
  });

  it('isModerator returns false when permission does not exist', async () => {
    mockPrisma.permissionGrant.findFirst = vi.fn().mockResolvedValue(null);

    const result = await isModerator(7);
    expect(result).toBe(false);
    expect(mockPrisma.permissionGrant.findFirst).toHaveBeenCalledWith({
      where: { user_id: 7, type: 'MODERATOR' },
    });
  });
});
