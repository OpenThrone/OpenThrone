import { describe, expect, it, mock } from 'bun:test';

import {
  lockRecruitmentRecipient,
  parseRecruitmentSessionId,
} from '@/services/recruitmentGuards';

describe('recruitment session IDs', () => {
  it('allows manual recruitment only when the ID is omitted', () => {
    expect(parseRecruitmentSessionId(null)).toBeNull();
    expect(parseRecruitmentSessionId('123')).toBe(123);
    expect(parseRecruitmentSessionId('2147483647')).toBe(2147483647);
  });

  it('rejects inputs that parseInt would truncate or silently downgrade', () => {
    for (const value of [
      '',
      '0',
      '-1',
      '12extra',
      '1.5',
      '1e2',
      ' 1',
      'NaN',
      '2147483648',
    ]) {
      expect(() => parseRecruitmentSessionId(value)).toThrow();
    }
  });
});

describe('recruitment history lock', () => {
  it('uses a parameterized transaction lock scoped to the history recipient', async () => {
    const query = mock(async () => []);
    const tx = { $queryRaw: query } as unknown as Parameters<
      typeof lockRecruitmentRecipient
    >[0];
    await lockRecruitmentRecipient(tx, 42);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, namespace, id] = query.mock.calls[0] as unknown as [
      TemplateStringsArray,
      number,
      number,
    ];
    expect(sql.join('?')).toContain('pg_advisory_xact_lock');
    expect(namespace).toBe(1380270930);
    expect(id).toBe(42);
  });

  it('rejects invalid recipients before issuing a query', async () => {
    const query = mock(async () => []);
    const tx = { $queryRaw: query } as unknown as Parameters<
      typeof lockRecruitmentRecipient
    >[0];
    for (const id of [0, -1, 1.5, NaN, 2147483648]) {
      await expect(lockRecruitmentRecipient(tx, id)).rejects.toThrow();
    }
    expect(query).not.toHaveBeenCalled();
  });
});
