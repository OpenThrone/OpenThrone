import { describe, expect, it } from 'bun:test';

import {
  ALLIANCE_ADMIN_AUDIT_ACTIONS,
  AllianceAdminActionSchema,
  canForceEndWar,
  loanAdminAction,
  loanRemaining,
} from '@/components/admin/allianceAdminActions';

describe('AllianceAdminActionSchema', () => {
  it('accepts each action with coerced ids', () => {
    expect(
      AllianceAdminActionSchema.parse({
        action: 'transfer_leadership',
        newLeaderId: '7',
      }),
    ).toEqual({ action: 'transfer_leadership', newLeaderId: 7 });
    expect(
      AllianceAdminActionSchema.parse({ action: 'rename', name: '  Iron  ' }),
    ).toEqual({ action: 'rename', name: 'Iron' });
    expect(
      AllianceAdminActionSchema.safeParse({ action: 'end_war', warId: 3 })
        .success,
    ).toBe(true);
  });

  it('accepts the era lifecycle actions and audits them', () => {
    for (const action of ['reserve', 'reactivate'] as const) {
      expect(AllianceAdminActionSchema.parse({ action })).toEqual({ action });
    }
    expect(ALLIANCE_ADMIN_AUDIT_ACTIONS.reserve).toBe('ADMIN_ALLIANCE_RESERVE');
    expect(ALLIANCE_ADMIN_AUDIT_ACTIONS.reactivate).toBe(
      'ADMIN_ALLIANCE_REACTIVATE',
    );
  });

  it('accepts Alliance Hall levels 0..5 only, without coercion', () => {
    expect(
      AllianceAdminActionSchema.parse({ action: 'set_hall_level', level: 0 }),
    ).toEqual({ action: 'set_hall_level', level: 0 });
    expect(
      AllianceAdminActionSchema.parse({ action: 'set_hall_level', level: 5 }),
    ).toEqual({ action: 'set_hall_level', level: 5 });
    for (const level of [6, -1, 1.5, '2', null, undefined]) {
      expect(
        AllianceAdminActionSchema.safeParse({ action: 'set_hall_level', level })
          .success,
      ).toBe(false);
    }
    expect(ALLIANCE_ADMIN_AUDIT_ACTIONS.set_hall_level).toBe(
      'ADMIN_ALLIANCE_SET_HALL_LEVEL',
    );
  });

  it('accepts the join fee and dues as whole gold within the bounds', () => {
    expect(
      AllianceAdminActionSchema.parse({
        action: 'set_dues',
        joinFee: 10_000_000,
        duesAmount: 20_000_000,
        duesPeriod: 'MONTHLY',
      }),
    ).toEqual({
      action: 'set_dues',
      joinFee: 10_000_000n,
      duesAmount: 20_000_000n,
      duesPeriod: 'MONTHLY',
    });
    for (const patch of [
      { joinFee: 10_000_001 },
      { joinFee: -1 },
      { joinFee: '5' },
      { duesAmount: 1.5 },
      { duesPeriod: 'YEARLY' },
    ]) {
      expect(
        AllianceAdminActionSchema.safeParse({
          action: 'set_dues',
          joinFee: 0,
          duesAmount: 0,
          duesPeriod: 'NONE',
          ...patch,
        }).success,
      ).toBe(false);
    }
    expect(ALLIANCE_ADMIN_AUDIT_ACTIONS.set_dues).toBe(
      'ADMIN_ALLIANCE_SET_DUES',
    );
  });

  it('rejects unknown actions, blank names and bad ids', () => {
    expect(
      AllianceAdminActionSchema.safeParse({ action: 'nuke' }).success,
    ).toBe(false);
    expect(
      AllianceAdminActionSchema.safeParse({ action: 'rename', name: '   ' })
        .success,
    ).toBe(false);
    expect(
      AllianceAdminActionSchema.safeParse({
        action: 'rename',
        name: 'x'.repeat(101),
      }).success,
    ).toBe(false);
    expect(
      AllianceAdminActionSchema.safeParse({ action: 'forgive_loan', loanId: 0 })
        .success,
    ).toBe(false);
  });

  it('maps every action to an audit name', () => {
    for (const option of AllianceAdminActionSchema.options) {
      const name = option.shape.action.value;
      expect(ALLIANCE_ADMIN_AUDIT_ACTIONS[name]).toMatch(/^ADMIN_ALLIANCE_/);
    }
  });
});

describe('loan helpers', () => {
  it('computes the remaining balance, floored at zero', () => {
    expect(loanRemaining({ amount_owed: '110', amount_repaid: '40' })).toBe(
      70n,
    );
    expect(loanRemaining({ amount_owed: 10n, amount_repaid: 12n })).toBe(0n);
  });
  it('reads the API form of bigint amounts', () => {
    expect(loanRemaining({ amount_owed: '110n', amount_repaid: '40n' })).toBe(
      70n,
    );
  });

  it('picks the admin action for a loan status', () => {
    expect(loanAdminAction('ACTIVE')).toBe('forgive_loan');
    expect(loanAdminAction('DEFAULTED')).toBe('forgive_loan');
    expect(loanAdminAction('REQUESTED')).toBe('cancel_loan');
    expect(loanAdminAction('REPAID')).toBeNull();
  });

  it('only allows ending unfinished wars', () => {
    expect(canForceEndWar('ACTIVE')).toBe(true);
    expect(canForceEndWar('ENDED')).toBe(false);
  });
});
