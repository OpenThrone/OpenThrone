import { describe, expect, it } from 'bun:test';

import {
  LOAN_INCOME_SHARE_PERCENT,
  LOAN_INTEREST_PCT_MAX,
  LOAN_TERM_DAYS_MAX,
  LOAN_TERM_DAYS_MIN,
  MEMBER_DAILY_CAP_MAX,
  MEMBER_DAILY_CAP_MIN,
} from '@/constants/allianceTreasury';
import {
  MAX_FORCE_PILLAGE_BPS,
  MAX_FORCE_QUANTITY,
  MAX_FORCE_TERM_DAYS,
} from '@/utils/temporaryForces';

import {
  isRuntimeSettingKey,
  RUNTIME_SETTING_GROUPS,
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
  validateRuntimeSettingConsistency,
} from './runtimeSettings';

describe('runtime setting registry', () => {
  it('contains only the supported non-secret settings', () => {
    expect(RUNTIME_SETTING_KEYS).toEqual([
      'stamina.penaltyThreshold',
      'stamina.minOffensePercent',
      'stamina.enabled',
      'stamina.recoveryEnabled',
      'stamina.recoveryAmount',
      'stamina.recoveryIntervalMinutes',
      'stamina.baseCost',
      'stamina.perTurnCost',
      'account.inactivity.remindersEnabled',
      'account.inactivity.autoAnonymizeEnabled',
      'email.outbox.enabled',
      'email.outbox.ratePerMinute',
      'recruit.dailyCap',
      'recruit.internalDailyCap',
      'recruit.externalIpDailyCap',
      'era.protectionDurationDays',
      'mercenary.hireMultiplier',
      'mercenary.dailyPriceRate',
      'combat.pairDailyLimit',
      'era.protectionLevelLimit',
      'bank.depositCapPercent',
      'friend.dailyReceivedCap',
      'alliance.maxPendingGoldRequests',
      'force.maxQuantity',
      'force.maxTermDays',
      'force.maxPillageBps',
      'alliance.loanTermMinDays',
      'alliance.loanTermMaxDays',
      'alliance.loanInterestMaxPercent',
      'alliance.memberDailyCapMin',
      'alliance.memberDailyCapMax',
      'alliance.loanIncomeSharePercent',
      'ENABLE_SUPPORTER',
      'ENABLE_ATTACKING',
      'ATTACK_LEVEL_RANGE',
      'ENABLE_INFILTRATIONS',
      'ENABLE_ASSASSINATIONS',
      'ENABLE_INTEL',
      'ENABLE_SOCIAL',
      'ENABLE_MESSAGING',
      'ENABLE_ENEMIES',
      'ENABLE_DESERTION',
      'ENABLE_REANIMATION',
      'ENABLE_GARRISON_FATIGUE',
      'SHOW_KINGDOM_MORALE',
      'SHOW_DUNGEON',
      'DISABLE_LOGIN',
      'DISABLE_REGISTRATION',
      'MAINTENANCE_MODE',
    ]);
    expect(isRuntimeSettingKey('DATABASE_URL')).toBe(false);
  });

  it('assigns every setting to exactly one known group', () => {
    for (const key of RUNTIME_SETTING_KEYS) {
      expect(
        RUNTIME_SETTING_GROUPS.filter(
          (group) => RUNTIME_SETTING_REGISTRY[key].group === group,
        ),
      ).toHaveLength(1);
    }
  });

  it('preserves balance defaults and validates their bounds', () => {
    const settings = [
      ['force.maxQuantity', 1000000, 1, 10000000],
      ['force.maxTermDays', 30, 1, 365],
      ['force.maxPillageBps', 2500, 0, 10000],
      ['alliance.loanTermMinDays', 1, 1, 365],
      ['alliance.loanTermMaxDays', 14, 1, 365],
      ['alliance.loanInterestMaxPercent', 25, 0, 100],
      ['alliance.memberDailyCapMin', 100000, 0, 1000000000],
      ['alliance.memberDailyCapMax', 50000000, 0, 1000000000],
      ['alliance.loanIncomeSharePercent', 25, 0, 100],
      ['mercenary.hireMultiplier', 1.25, 0, 100],
      ['mercenary.dailyPriceRate', 0.05, 0, 1],
      ['combat.pairDailyLimit', 5, 0, 1000],
      ['era.protectionLevelLimit', 10, 1, 1000],
      ['bank.depositCapPercent', 80, 0, 100],
      ['friend.dailyReceivedCap', 3000000, 0, 1000000000],
      ['alliance.maxPendingGoldRequests', 3, 0, 1000],
    ] as const;
    for (const [key, fallback, min, max] of settings) {
      const setting = RUNTIME_SETTING_REGISTRY[key];
      expect(setting.fallback).toBe(fallback);
      expect(setting.schema.safeParse(min).success).toBe(true);
      expect(setting.schema.safeParse(max).success).toBe(true);
      expect(setting.schema.safeParse(min - 1).success).toBe(false);
      expect(setting.schema.safeParse(max + 1).success).toBe(false);
    }
  });

  it('retains the existing force and treasury constants as defaults', () => {
    expect([
      RUNTIME_SETTING_REGISTRY['force.maxQuantity'].fallback,
      RUNTIME_SETTING_REGISTRY['force.maxTermDays'].fallback,
      RUNTIME_SETTING_REGISTRY['force.maxPillageBps'].fallback,
      RUNTIME_SETTING_REGISTRY['alliance.loanTermMinDays'].fallback,
      RUNTIME_SETTING_REGISTRY['alliance.loanTermMaxDays'].fallback,
      RUNTIME_SETTING_REGISTRY['alliance.loanInterestMaxPercent'].fallback,
      RUNTIME_SETTING_REGISTRY['alliance.memberDailyCapMin'].fallback,
      RUNTIME_SETTING_REGISTRY['alliance.memberDailyCapMax'].fallback,
      RUNTIME_SETTING_REGISTRY['alliance.loanIncomeSharePercent'].fallback,
    ]).toEqual([
      MAX_FORCE_QUANTITY,
      MAX_FORCE_TERM_DAYS,
      MAX_FORCE_PILLAGE_BPS,
      LOAN_TERM_DAYS_MIN,
      LOAN_TERM_DAYS_MAX,
      LOAN_INTEREST_PCT_MAX,
      MEMBER_DAILY_CAP_MIN,
      MEMBER_DAILY_CAP_MAX,
      LOAN_INCOME_SHARE_PERCENT,
    ]);
  });

  it('rejects inverted related limits', () => {
    const valid = {
      loanTermMin: 1,
      loanTermMax: 14,
      memberCapMin: 100000,
      memberCapMax: 50000000,
    };
    expect(() => validateRuntimeSettingConsistency(valid)).not.toThrow();
    expect(() =>
      validateRuntimeSettingConsistency({ ...valid, loanTermMin: 15 }),
    ).toThrow();
    expect(() =>
      validateRuntimeSettingConsistency({ ...valid, memberCapMax: 1 }),
    ).toThrow();
  });

  it('validates bounded values and structured maintenance state', () => {
    expect(
      RUNTIME_SETTING_REGISTRY.ATTACK_LEVEL_RANGE.schema.safeParse(1).success,
    ).toBe(true);
    expect(
      RUNTIME_SETTING_REGISTRY.ATTACK_LEVEL_RANGE.schema.safeParse(101).success,
    ).toBe(false);
    expect(
      RUNTIME_SETTING_REGISTRY.MAINTENANCE_MODE.schema.safeParse({
        enabled: true,
        message: 'Downtime',
      }).success,
    ).toBe(true);
    expect(
      RUNTIME_SETTING_REGISTRY.MAINTENANCE_MODE.schema.safeParse({
        enabled: 'true',
        message: '',
      }).success,
    ).toBe(false);
    expect(
      RUNTIME_SETTING_REGISTRY.MAINTENANCE_MODE.schema.safeParse({
        enabled: true,
        message: 'x'.repeat(1001),
      }).success,
    ).toBe(false);
  });

  it('keeps the protection duration to whole days from 1 to 60 (default 14)', () => {
    const setting = RUNTIME_SETTING_REGISTRY['era.protectionDurationDays'];
    expect(setting.fallback).toBe(14);
    expect(setting.schema.safeParse(1).success).toBe(true);
    expect(setting.schema.safeParse(60).success).toBe(true);
    expect(setting.schema.safeParse(0).success).toBe(false);
    expect(setting.schema.safeParse(61).success).toBe(false);
    expect(setting.schema.safeParse(7.5).success).toBe(false);
    expect(setting.schema.safeParse('14').success).toBe(false);
  });

  it('keeps independent recruitment allowances with the requested defaults', () => {
    expect(RUNTIME_SETTING_REGISTRY['recruit.internalDailyCap'].fallback).toBe(
      250,
    );
    expect(RUNTIME_SETTING_REGISTRY['recruit.dailyCap'].fallback).toBe(25);
    expect(
      RUNTIME_SETTING_REGISTRY['recruit.externalIpDailyCap'].fallback,
    ).toBe(5);
    for (const key of [
      'recruit.internalDailyCap',
      'recruit.dailyCap',
      'recruit.externalIpDailyCap',
    ] as const) {
      const setting = RUNTIME_SETTING_REGISTRY[key];
      expect(setting.schema.safeParse(0).success).toBe(true);
      expect(setting.schema.safeParse(1000).success).toBe(true);
      expect(setting.schema.safeParse(1001).success).toBe(false);
      expect(setting.schema.safeParse(2.5).success).toBe(false);
    }
  });
});

const ADMIN_SYSTEM_COPY = {
  en: require('../../public/locales/en/admin-system.json'),
  de: require('../../public/locales/de/admin-system.json'),
  es: require('../../public/locales/es/admin-system.json'),
};

describe('runtime setting labels', () => {
  it('names every setting in every admin locale', () => {
    for (const [locale, copy] of Object.entries(ADMIN_SYSTEM_COPY)) {
      const missing = RUNTIME_SETTING_KEYS.filter(
        (key) => typeof copy.settings?.labels?.[key] !== 'string',
      );
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });
});
