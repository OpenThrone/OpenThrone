import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { loadProtectionContext } = await import('./BattleProtection.service');

describe('battle protection recruitment allowance', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.serverSetting.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.era.findFirst = vi.fn().mockResolvedValue(null);
  });

  it('adds internal and external daily caps for the population threshold', async () => {
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'recruit.internalDailyCap', value: 250 },
      { key: 'recruit.dailyCap', value: 25 },
    ]);

    const context = await loadProtectionContext();

    expect(context.settings.recruitDailyCap).toBe(275);
  });

  it('uses independent defaults when recruitment settings have no overrides', async () => {
    const context = await loadProtectionContext();

    expect(context.settings.recruitDailyCap).toBe(275);
  });
});
