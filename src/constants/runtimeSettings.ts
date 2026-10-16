import { z } from 'zod';

export const MaintenanceModeSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(1000),
});

export const RUNTIME_SETTING_REGISTRY = {
  'account.inactivity.remindersEnabled': {
    type: 'BOOLEAN',
    label: 'Inactivity reminders',
    isPublic: false,
    schema: z.boolean(),
    env: undefined,
    fallback: false,
  },
  'account.inactivity.autoAnonymizeEnabled': {
    type: 'BOOLEAN',
    label: 'Automatic inactivity anonymization',
    isPublic: false,
    schema: z.boolean(),
    env: undefined,
    fallback: false,
  },
  'email.outbox.enabled': {
    type: 'BOOLEAN',
    label: 'Email outbox enabled',
    isPublic: false,
    schema: z.boolean(),
    env: undefined,
    fallback: false,
  },
  'email.outbox.ratePerMinute': {
    type: 'NUMBER',
    label: 'Emails per minute',
    isPublic: false,
    schema: z.number().int().min(1).max(600),
    env: undefined,
    fallback: 60,
  },
  'era.dailyCitizenBonus': {
    type: 'NUMBER',
    label: 'Daily citizen bonus',
    isPublic: true,
    schema: z.number().int().min(0).max(100000),
    env: undefined,
    fallback: 0,
  },
  'era.dailyCitizenBonusActivityHours': {
    type: 'NUMBER',
    label: 'Daily citizen bonus activity window (hours)',
    isPublic: false,
    schema: z.number().int().min(0).max(720),
    env: undefined,
    fallback: 24,
  },
  ENABLE_ATTACKING: {
    type: 'BOOLEAN',
    label: 'Attacking',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_ENABLE_ATTACKING',
    fallback: true,
  },
  ATTACK_LEVEL_RANGE: {
    type: 'NUMBER',
    label: 'Attack level range',
    isPublic: true,
    schema: z.number().int().min(1).max(100),
    env: 'NEXT_PUBLIC_ATTACK_LEVEL_RANGE',
    fallback: 5,
  },
  ENABLE_INFILTRATIONS: {
    type: 'BOOLEAN',
    label: 'Infiltrations',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_ENABLE_INFILTRATIONS',
    fallback: false,
  },
  ENABLE_ASSASSINATIONS: {
    type: 'BOOLEAN',
    label: 'Assassinations',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_ENABLE_ASSASSINATIONS',
    fallback: false,
  },
  ENABLE_INTEL: {
    type: 'BOOLEAN',
    label: 'Intel',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_ENABLE_INTEL',
    fallback: false,
  },
  ENABLE_SOCIAL: {
    type: 'BOOLEAN',
    label: 'Social',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_ENABLE_SOCIAL',
    fallback: false,
  },
  ENABLE_ENEMIES: {
    type: 'BOOLEAN',
    label: 'Enemies',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_ENABLE_ENEMIES',
    fallback: false,
  },
  DISABLE_LOGIN: {
    type: 'BOOLEAN',
    label: 'Disable login',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_DISABLE_LOGIN',
    fallback: false,
  },
  DISABLE_REGISTRATION: {
    type: 'BOOLEAN',
    label: 'Disable registration',
    isPublic: true,
    schema: z.boolean(),
    env: 'NEXT_PUBLIC_DISABLE_REGISTRATION',
    fallback: false,
  },
  MAINTENANCE_MODE: {
    type: 'JSON',
    label: 'Maintenance mode',
    isPublic: true,
    schema: MaintenanceModeSchema,
    env: undefined,
    fallback: { enabled: false, message: '' },
  },
} as const;

export type RuntimeSettingKey = keyof typeof RUNTIME_SETTING_REGISTRY;
export type RuntimeSettingValue =
  | boolean
  | number
  | { enabled: boolean; message: string };
export const RUNTIME_SETTING_KEYS = Object.keys(
  RUNTIME_SETTING_REGISTRY,
) as RuntimeSettingKey[];

export function isRuntimeSettingKey(key: string): key is RuntimeSettingKey {
  return Object.prototype.hasOwnProperty.call(RUNTIME_SETTING_REGISTRY, key);
}
