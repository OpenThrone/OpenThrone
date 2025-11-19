import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { installMockPrisma, mockPrisma, resetMockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

// Require module under test after mocks installed
const userService = require('../user.service');
const { updateLastActive, userExists } = userService;

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

  it('updateLastActive throws when no identifiers provided', async () => {
    await expect(updateLastActive({})).rejects.toThrow();
  });

  it('updateLastActive updates last_active when email provided', async () => {
    mockPrisma.users.update.mockResolvedValue({ id: 1 });
    const res = await updateLastActive({ email: 'a@b.com' });
    expect(mockPrisma.users.update).toHaveBeenCalled();
    expect(res).toBeDefined();
  });
});
