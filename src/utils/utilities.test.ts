import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'bun:test';
import { installMockMtRand } from 'test/utils/mockMtRand';

import {
  generateRandomString,
  getAvatarSrc,
  getGoldTxSymbol,
  getLevelChange,
  getTransactionType,
} from '@/utils/utilities';

// Install deterministic mtRand before importing modules that may use randomness
installMockMtRand(vi);

describe('generateRandomString', () => {
  it('should generate a random string of the specified length', () => {
    const length = 10;
    const randomString = generateRandomString(length);
    expect(randomString.length).toBe(length);
  });

  it('should only contain alphanumeric characters', () => {
    const length = 10;
    const randomString = generateRandomString(length);
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    expect(alphanumericRegex.test(randomString)).toBe(true);
  });

  it('should generate different strings for different calls', () => {
    const length = 10;
    const randomString1 = generateRandomString(length);
    const randomString2 = generateRandomString(length);
    expect(randomString1).not.toBe(randomString2);
  });
});

describe('getAvatarSrc', () => {
  it("should return the user's avatar image source", () => {
    const previousMode = process.env.NEXT_PUBLIC_ARTWORK_MODE;
    try {
      process.env.NEXT_PUBLIC_ARTWORK_MODE = 'pure';
      expect(getAvatarSrc('SHIELD', 'ELF')).toStartWith('data:image/svg+xml,');
    } finally {
      if (previousMode === undefined)
        delete process.env.NEXT_PUBLIC_ARTWORK_MODE;
      else process.env.NEXT_PUBLIC_ARTWORK_MODE = previousMode;
    }
    const avatar2 = 'http://example.com/image.jpg';
    expect(getAvatarSrc(avatar2)).toBe(avatar2);
  });
});

const saleEntry = (type: string, refund = false, self = false) => ({
  history_type: 'SALE',
  stats: { type },
  gold_amount: 24000,
  from_user_id: refund && !self ? 0 : 7,
  to_user_id: refund || self ? 7 : 0,
  from_user_account_type: refund ? 'BANK' : 'HAND',
  to_user_account_type: refund ? 'HAND' : 'BANK',
});

const saleLabels = [
  ['ARMORY_EQUIP', 'Armory Purchase'],
  ['ARMORY_UNEQUIP', 'Armory Sale'],
  ['ARMORY_UPGRADE', 'Armory Upgrade'],
  ['ARMORY_CONVERSION', 'Armory Conversion'],
  ['HIRE_MERCENARY', 'Mercenary Hire'],
  ['TRAINING_TRAIN', 'Train Units'],
  ['TRAINING_UNTRAIN', 'Untrain Units'],
  ['TRAINING_CONVERSION', 'Convert Units'],
  ['BATTLE_UPGRADES_BUY', 'Battle Upgrade Purchase'],
  ['BATTLE_UPGRADES_SELL', 'Battle Upgrade Sale'],
];

describe('bank history gameplay labels and signs (issue 30)', () => {
  for (const [type, label] of saleLabels) {
    it(`labels ${type} before the generic self-transaction fallback`, () => {
      expect(getTransactionType(saleEntry(type))).toBe(label);
      expect(getTransactionType(saleEntry(type, false, true))).toBe(label);
      expect(getTransactionType(saleEntry(type, true, true))).toBe(label);
    });
    it(`uses gold direction for ${type} charges and refunds`, () => {
      expect(getGoldTxSymbol(saleEntry(type), { id: 7 })).toBe('-');
      expect(getGoldTxSymbol(saleEntry(type, true), { id: 7 })).toBe('+');
      expect(getGoldTxSymbol(saleEntry(type, false, true), { id: 7 })).toBe(
        '-',
      );
      expect(getGoldTxSymbol(saleEntry(type, true, true), { id: 7 })).toBe('+');
    });
  }
  it('normalizes JSON string ids without crediting unrelated viewers', () => {
    const entry = {
      ...saleEntry('ARMORY_CONVERSION', true, true),
      from_user_id: '7',
      to_user_id: '7',
    };
    expect(getTransactionType(entry)).toBe('Armory Conversion');
    expect(getGoldTxSymbol(entry, { id: 7 })).toBe('+');
    expect(getGoldTxSymbol(entry, { id: '7' })).toBe('+');
    expect(getGoldTxSymbol(entry, { id: 8 })).toBe('-');
  });
  it('keeps bank deposits positive and withdrawals negative', () => {
    const deposit = {
      ...saleEntry('DEPOSIT', false, true),
      history_type: 'TRANSFER',
    };
    const withdrawal = {
      ...saleEntry('WITHDRAW', true, true),
      history_type: 'TRANSFER',
    };
    expect(getTransactionType(deposit)).toBe('Deposit');
    expect(getGoldTxSymbol(deposit, { id: 7 })).toBe('+');
    expect(getTransactionType(withdrawal)).toBe('Withdraw');
    expect(getGoldTxSymbol(withdrawal, { id: 7 })).toBe('-');
  });
  it('handles missing, malformed and unrecognized stats without mislabeling', () => {
    for (const stats of [
      undefined,
      null,
      [],
      'bad',
      { type: 'FUTURE_EVENT' },
      { type: 'toString' },
    ]) {
      expect(getTransactionType({ ...saleEntry('unused'), stats })).toBe(
        'UNKNOWN',
      );
    }
  });
  it('offers translation keys for the new Armory and mercenary labels', () => {
    const translate = vi.fn((key: string) => `translated:${key}`);
    expect(getTransactionType(saleEntry('ARMORY_EQUIP'), translate)).toBe(
      'translated:bank.transactionTypes.armoryPurchase',
    );
    expect(translate).toHaveBeenCalledWith(
      'bank.transactionTypes.armoryPurchase',
    );
  });
  it('maps every history stats type emitted by the Armory and Training services', () => {
    for (const file of ['Armory.service.ts', 'Training.service.ts']) {
      const source = readFileSync(
        new URL(`../services/${file}`, import.meta.url),
        'utf8',
      );
      const types = [
        ...source.matchAll(/stats:\s*\{\s*type:\s*['"]([^'"]+)['"]/g),
      ].map((match) => match[1]);
      expect(types.length).toBeGreaterThan(0);
      for (const type of types)
        expect(getTransactionType(saleEntry(type))).not.toBe('UNKNOWN');
    }
  });
});

describe('getLevelChange', () => {
  it('reports nothing when the level holds', () => {
    expect(getLevelChange(2917, 2025)).toBeNull();
    expect(getLevelChange(0, 0)).toBeNull();
  });

  it('reports the new level when earned XP crosses a threshold', () => {
    expect(getLevelChange(7000, 2025)).toEqual({
      from: 1,
      to: 2,
      endedProtection: false,
    });
  });

  it('flags the level 9 to 10 crossing as the end of protection', () => {
    expect(getLevelChange(75_000, 2025)).toEqual({
      from: 9,
      to: 10,
      endedProtection: true,
    });
  });

  it('does not flag protection when already past level 9', () => {
    expect(getLevelChange(76_000, 100_000)?.endedProtection).toBe(false);
  });

  it('ignores reports without a starting XP and tolerates missing earned XP', () => {
    expect(getLevelChange(undefined, 5000)).toBeNull();
    expect(getLevelChange(7999, undefined)).toBeNull();
  });
});
