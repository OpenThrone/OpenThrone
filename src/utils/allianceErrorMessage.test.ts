import { describe, expect, it } from 'bun:test';

import { AllianceRuleError } from '@/constants/allianceErrors';
import { allianceErrorText } from '@/utils/allianceErrorMessage';
import { publicErrorBody } from '@/utils/publicError';

describe('allianceErrorText', () => {
  it('translates a coded refusal with its params', () => {
    const t = (key: string, options?: Record<string, unknown>) =>
      key === 'alliances:errors.ALLIANCE_TREASURY_CAP'
        ? `cap ${options?.cap} room ${options?.room} ${options?.levelName}`
        : key.startsWith('alliances:upgrades.levels.')
          ? 'Lager'
          : String(options?.defaultValue);
    expect(
      allianceErrorText(
        {
          code: 'ALLIANCE_TREASURY_CAP',
          error: 'English',
          params: { level: 0, cap: 5000000, room: 10 },
        },
        t,
      ),
    ).toBe('cap 5000000 room 10 Lager');
  });

  it('falls back to the English message without a code or translation', () => {
    expect(allianceErrorText({ error: 'Plain' })).toBe('Plain');
    const missing = (_key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue);
    expect(
      allianceErrorText({ code: 'ALLIANCE_NEW', error: 'English' }, missing),
    ).toBe('English');
  });

  it('formats a deposit wait in minutes', () => {
    const t = (key: string, options?: Record<string, unknown>) =>
      key.startsWith('alliances:errors.') ? String(options?.wait) : 'x';
    expect(
      allianceErrorText(
        {
          code: 'ALLIANCE_DEPOSIT_LIMIT',
          params: { level: 0, waitMinutes: 135 },
        },
        t,
      ),
    ).toBe('2h 15m');
  });
});

describe('publicErrorBody', () => {
  it('returns code and params for an alliance rule error only', () => {
    const body = publicErrorBody(
      new AllianceRuleError('ALLIANCE_UPGRADE_FUNDS', 'Not enough', {
        cost: 5,
      }),
    );
    expect(body).toEqual({
      error: 'Not enough',
      code: 'ALLIANCE_UPGRADE_FUNDS',
      params: { cost: 5 },
    });
    const prismaLike = Object.assign(new Error('Unique constraint'), {
      code: 'P2002',
    });
    expect(publicErrorBody(prismaLike)).toEqual({ error: 'Unique constraint' });
  });
});
