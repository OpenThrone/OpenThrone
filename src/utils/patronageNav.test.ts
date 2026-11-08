import { describe, expect, it } from 'bun:test';

import type { SupporterStatus } from '@/types/supporter';

import { showPatronageLink } from './patronageNav';

const status = (over: Partial<SupporterStatus> = {}): SupporterStatus => ({
  isActive: true,
  tier: 'SUPPORTER',
  status: 'ACTIVE',
  source: 'SUBSCRIPTION',
  activeUntil: '2026-12-28T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  badgeVisible: true,
  canManageBilling: true,
  provider: 'stripe',
  ...over,
});

describe('Patronage menu link', () => {
  it('shows for everyone while sales are on', () => {
    expect(showPatronageLink(true, null)).toBe(true);
  });

  it('hides from a one-time pass holder while sales are off', () => {
    expect(showPatronageLink(false, status({ source: 'ONE_TIME' }))).toBe(
      false,
    );
  });

  it('keeps a renewing subscription able to cancel while sales are off', () => {
    expect(showPatronageLink(false, status())).toBe(true);
    expect(showPatronageLink(false, status({ status: 'PAST_DUE' }))).toBe(true);
  });

  it('hides once the subscription will not charge again', () => {
    expect(showPatronageLink(false, status({ cancelAtPeriodEnd: true }))).toBe(
      false,
    );
    expect(showPatronageLink(false, status({ status: 'CANCELED' }))).toBe(
      false,
    );
  });

  it('hides from players with no membership while sales are off', () => {
    expect(showPatronageLink(false, null)).toBe(false);
  });
});
