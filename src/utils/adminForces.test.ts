import { describe, expect, it } from 'bun:test';

import {
  adminContractOutcome,
  blocksAdminOnAdmin,
  elapsedAllianceContracts,
  forceMutationPermission,
  planAdminHealAll,
  woundsByContract,
} from '@/utils/adminForces';

describe('planAdminHealAll', () => {
  it('restores permanent wounds, clears active contract wounds, drops closed ones', () => {
    const plan = planAdminHealAll(
      [
        { type: 'OFFENSE', level: 1, quantity: 10 },
        { type: 'OFFENSE', level: 1, quantity: 5 },
        { type: 'DEFENSE', level: 2, quantity: 3, isMercenary: true },
        { forceContractId: 7, type: 'OFFENSE', level: 1, quantity: 4 },
        { forceContractId: 8, type: 'OFFENSE', level: 1, quantity: 2 },
        { type: 'SPY', level: 1, quantity: 0 },
      ],
      new Set([7]),
    );
    expect(plan.restore).toEqual([
      { type: 'OFFENSE', level: 1, isMercenary: false, quantity: 15 },
      { type: 'DEFENSE', level: 2, isMercenary: true, quantity: 3 },
    ]);
    expect(plan.contractHealed).toBe(4);
    expect(plan.dropped).toBe(2);
  });

  it('tolerates non-array input', () => {
    expect(planAdminHealAll(null, new Set())).toEqual({
      restore: [],
      contractHealed: 0,
      dropped: 0,
    });
  });
});

describe('woundsByContract', () => {
  it('sums by contract id and ignores permanent wounds', () => {
    const m = woundsByContract([
      { forceContractId: 1, quantity: 2 },
      { forceContractId: 1, quantity: 3 },
      { quantity: 9 },
    ]);
    expect(m.get(1)).toBe(5);
    expect(m.size).toBe(1);
  });
});

describe('adminContractOutcome', () => {
  it('maps statuses', () => {
    expect(adminContractOutcome('ACTIVE', 'EXPIRE')).toBe('EXPIRED');
    expect(adminContractOutcome('ACTIVE', 'TERMINATE')).toBe('DISMISSED');
    expect(adminContractOutcome('REQUESTED', 'EXPIRE')).toBe('CANCELLED');
    expect(adminContractOutcome('EXPIRED', 'TERMINATE')).toBeNull();
  });
});

describe('forceMutationPermission', () => {
  it('maps player-scoped ops to MANAGE_USERS and alliance ops to MANAGE_ALLIANCES', () => {
    expect(
      forceMutationPermission({ op: 'closeContract', kind: 'MERCENARY' }),
    ).toBe('MANAGE_USERS');
    expect(
      forceMutationPermission({ op: 'closeContract', kind: 'ALLIANCE' }),
    ).toBe('MANAGE_ALLIANCES');
    expect(forceMutationPermission({ op: 'returnForce' })).toBe(
      'MANAGE_ALLIANCES',
    );
    expect(forceMutationPermission({ op: 'waiveObligation' })).toBe(
      'MANAGE_USERS',
    );
    expect(forceMutationPermission({ op: 'healWounded' })).toBe('MANAGE_USERS');
  });
});

describe('blocksAdminOnAdmin', () => {
  const admin = [{ role: 'ADMINISTRATOR', revokedAt: null }];
  it('blocks acting on another active administrator', () => {
    expect(blocksAdminOnAdmin(1, 2, admin)).toBe(true);
  });
  it('allows self, revoked admins and other staff', () => {
    expect(blocksAdminOnAdmin(2, 2, admin)).toBe(false);
    expect(
      blocksAdminOnAdmin(1, 2, [
        { role: 'ADMINISTRATOR', revokedAt: new Date() },
        { role: 'MODERATOR', revokedAt: null },
      ]),
    ).toBe(false);
  });
});

describe('elapsedAllianceContracts', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  const past = new Date('2026-10-27T00:00:00Z');
  const future = new Date('2026-10-29T00:00:00Z');
  it('selects only active, elapsed alliance deployments', () => {
    const picked = elapsedAllianceContracts(
      [
        { id: 1, kind: 'ALLIANCE', status: 'ACTIVE', expiresAt: past },
        { id: 2, kind: 'ALLIANCE', status: 'ACTIVE', expiresAt: future },
        { id: 3, kind: 'MERCENARY', status: 'ACTIVE', expiresAt: past },
        { id: 4, kind: 'ALLIANCE', status: 'EXPIRED', expiresAt: past },
        { id: 5, kind: 'ALLIANCE', status: 'ACTIVE', expiresAt: now },
      ],
      now,
    );
    expect(picked.map((c) => c.id)).toEqual([1, 5]);
  });
});
