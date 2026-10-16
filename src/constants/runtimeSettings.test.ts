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
      'era.dailyCitizenBonus',
      'era.dailyCitizenBonusActivityHours',
      'ENABLE_ATTACKING',
      'ATTACK_LEVEL_RANGE',
      'ENABLE_INFILTRATIONS',
      'ENABLE_ASSASSINATIONS',
      'ENABLE_INTEL',
      'ENABLE_SOCIAL',
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
});
