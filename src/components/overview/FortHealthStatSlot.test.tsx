import { MantineProvider } from '@mantine/core';
import { describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { computeFortRepairMax, FortHealthStatSlot } from './FortHealthStatSlot';

mock.module('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (typeof options === 'string') return options;
      if (options?.defaultValue) return options.defaultValue;
      return key;
    },
  }),
}));

const renderSlot = (user: any) => {
  return renderToStaticMarkup(
    <MantineProvider>
      <FortHealthStatSlot user={user} />
    </MantineProvider>,
  );
};

describe('FortHealthStatSlot: static rendering', () => {
  it('renders clean 100% health display without Repair Max button', () => {
    const mockUser: any = {
      fortLevel: 1,
      fortHitpoints: 50,
      fortHealth: {
        current: 50,
        max: 50,
        percentage: 100,
      },
      gold: 1000n,
      locale: 'en',
    };

    const html = renderSlot(mockUser);
    expect(html).toContain('href="/structures/repair"');
    expect(html).toContain('50/50 (100%)');
    expect(html).not.toContain('Repair Max');
    expect(html).not.toContain('fort-repair-max-btn');
  });

  it('renders Repair Max button and Fort Page link when fort is damaged', () => {
    const mockUser: any = {
      fortLevel: 1,
      fortHitpoints: 35,
      fortHealth: {
        current: 35,
        max: 50,
        percentage: 70,
      },
      gold: 500n,
      locale: 'en',
    };

    const html = renderSlot(mockUser);
    expect(html).toContain('35/50 (70%)');
    expect(html).toContain('Repair Max');
    expect(html).toContain('Fort Page');
    expect(html).toContain('data-testid="fort-repair-max-btn"');
    // Button should not be disabled
    expect(html).not.toContain('disabled=""');
  });

  it('disables Repair Max button when player has 0 gold', () => {
    const mockUser: any = {
      fortLevel: 1, // costPerRepairPoint is 5
      fortHitpoints: 35,
      fortHealth: {
        current: 35,
        max: 50,
        percentage: 70,
      },
      gold: 0n,
      locale: 'en',
    };

    const html = renderSlot(mockUser);
    expect(html).toContain('35/50 (70%)');
    expect(html).toContain('Repair Max');
    expect(html).toContain('disabled=""');
  });
});

describe('computeFortRepairMax calculation logic', () => {
  it('returns isDamaged=false and 0 repairable when at full health', () => {
    const result = computeFortRepairMax({
      fortLevel: 1,
      fortHitpoints: 50,
      fortHealth: { current: 50, max: 50, percentage: 100 },
      gold: 1000n,
    });

    expect(result.isDamaged).toBe(false);
    expect(result.missingHp).toBe(0);
    expect(result.maxRepairable).toBe(0);
    expect(result.canRepair).toBe(false);
    expect(result.formattedHealth).toBe('50/50 (100%)');
  });

  it('calculates full repair when player has surplus gold', () => {
    const result = computeFortRepairMax({
      fortLevel: 1, // level 1: costPerRepairPoint = 5
      fortHitpoints: 30,
      fortHealth: { current: 30, max: 50, percentage: 60 },
      gold: 500n,
    });

    expect(result.isDamaged).toBe(true);
    expect(result.missingHp).toBe(20);
    expect(result.costPerPoint).toBe(5);
    expect(result.affordableHp).toBe(100);
    expect(result.maxRepairable).toBe(20);
    expect(result.repairCost).toBe(100n);
    expect(result.canRepair).toBe(true);
  });

  it('calculates capped partial repair when player has limited gold', () => {
    const result = computeFortRepairMax({
      fortLevel: 1, // level 1: costPerRepairPoint = 5
      fortHitpoints: 20,
      fortHealth: { current: 20, max: 50, percentage: 40 },
      gold: 32n, // 32 / 5 = 6 affordable HP
    });

    expect(result.isDamaged).toBe(true);
    expect(result.missingHp).toBe(30);
    expect(result.affordableHp).toBe(6);
    expect(result.maxRepairable).toBe(6);
    expect(result.repairCost).toBe(30n);
    expect(result.canRepair).toBe(true);
  });

  it('prevents repair when player cannot afford even 1 HP', () => {
    const result = computeFortRepairMax({
      fortLevel: 1,
      fortHitpoints: 40,
      fortHealth: { current: 40, max: 50, percentage: 80 },
      gold: 3n, // less than costPerPoint (5)
    });

    expect(result.isDamaged).toBe(true);
    expect(result.missingHp).toBe(10);
    expect(result.affordableHp).toBe(0);
    expect(result.maxRepairable).toBe(0);
    expect(result.repairCost).toBe(0n);
    expect(result.canRepair).toBe(false);
  });
});
