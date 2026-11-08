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
