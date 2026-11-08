import { describe, expect, it, mock } from 'bun:test';

import {
  compareItemBalances,
  recordItemLedger,
} from '@/services/ItemLedger.service';

const helm = {
  userId: 1,
  type: 'HELM',
  usage: 'OFFENSE',
  level: 1,
} as const;
const boots = { ...helm, type: 'BOOTS' } as const;

describe('recordItemLedger', () => {
  const run = async (deltas: Parameters<typeof recordItemLedger>[3]) => {
    const createMany = mock(async () => ({ count: 0 }));
    await recordItemLedger(
      { itemLedgerEntry: { createMany } } as never,
      1,
      'ARMORY_BUY',
      deltas,
    );
    return createMany;
  };
  const { userId: _userId, ...helmKey } = helm;

  it('merges repeated keys and drops changes that cancel out', async () => {
    const createMany = await run([
      { ...helmKey, delta: 2 },
      { ...helmKey, delta: 3 },
      { ...helmKey, level: 2, delta: 4 },
      { ...helmKey, level: 2, delta: -4 },
    ]);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ ...helmKey, delta: 5, userId: 1, reason: 'ARMORY_BUY' }],
    });
  });

  it('writes nothing when no balance changes', async () => {
    const createMany = await run([{ ...helmKey, delta: 0 }]);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('compareItemBalances', () => {
  it('passes when checkpoint plus changes equals the balance', () => {
    const result = compareItemBalances(
      [{ ...helm, quantity: 12 }],
      [{ ...helm, quantity: 10 }],
      [
        { ...helm, delta: 5 },
        { ...helm, delta: -3 },
      ],
    );
    expect(result.mismatches).toEqual([]);
    expect(result.changedUsers).toEqual([1]);
  });

  it('reports a balance with no recorded change', () => {
    const result = compareItemBalances(
      [{ ...helm, quantity: 501 }],
      [{ ...helm, quantity: 500 }],
      [],
    );
    expect(result.mismatches).toEqual([
      {
        ...helm,
        checkpointQuantity: 500,
        ledgerDelta: 0,
        actualQuantity: 501,
        drift: 1,
      },
    ]);
    expect(result.changedUsers).toEqual([1]);
  });

  it('reports a balance that disappeared', () => {
    const { mismatches } = compareItemBalances(
      [],
      [{ ...helm, quantity: 4 }],
      [],
    );
    expect(mismatches[0]).toMatchObject({ actualQuantity: 0, drift: -4 });
  });

  it('treats a zero-quantity row and an absent row as the same balance', () => {
    const { mismatches, changedUsers } = compareItemBalances(
      [{ ...helm, quantity: 0 }],
      [],
      [],
    );
    expect(mismatches).toEqual([]);
    expect(changedUsers).toEqual([]);
  });

  it('leaves untouched players out of the checkpoint rewrite', () => {
    const other = { ...boots, userId: 2 };
    const { changedUsers, usersChecked, rowsChecked } = compareItemBalances(
      [
        { ...helm, quantity: 3 },
        { ...other, quantity: 9 },
      ],
      [{ ...other, quantity: 9 }],
      [{ ...helm, delta: 3 }],
    );
    expect(changedUsers).toEqual([1]);
    expect(usersChecked).toBe(2);
    expect(rowsChecked).toBe(2);
  });
});
