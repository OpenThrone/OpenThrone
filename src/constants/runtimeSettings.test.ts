import { describe, expect, it } from 'bun:test';

import {
  isRuntimeSettingKey,
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
} from './runtimeSettings';

describe('runtime setting registry', () => {
  it('contains only the supported non-secret settings', () => {
    expect(RUNTIME_SETTING_KEYS).toEqual([
      'account.inactivity.remindersEnabled',
      'account.inactivity.autoAnonymizeEnabled',
      'email.outbox.enabled',
      'email.outbox.ratePerMinute',
      'recruit.dailyCap',
      'recruit.internalDailyCap',
      'recruit.externalIpDailyCap',
      'era.protectionDurationDays',
      'ENABLE_ATTACKING',
      'ATTACK_LEVEL_RANGE',
      'ENABLE_INFILTRATIONS',
      'ENABLE_ASSASSINATIONS',
      'ENABLE_INTEL',
      'ENABLE_SOCIAL',
      'ENABLE_MESSAGING',
      'ENABLE_ENEMIES',
      'DISABLE_LOGIN',
      'DISABLE_REGISTRATION',
      'MAINTENANCE_MODE',
    ]);
    expect(isRuntimeSettingKey('DATABASE_URL')).toBe(false);
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
