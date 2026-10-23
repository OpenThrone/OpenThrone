import { z } from 'zod';

import { ItemTypes } from '@/constants/Items';
import { UnitTypes } from '@/constants/Units';

export const FORCE_DAY_MS = 86_400_000;
export const MAX_FORCE_QUANTITY = 1_000_000;
export const MAX_FORCE_TERM_DAYS = 30;
// Matches the existing alliance war-tax ceiling. Values remain balance-tunable.
export const MAX_FORCE_PILLAGE_BPS = 2_500;

export const ForceRoleSchema = z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']);
export type ForceRole = z.infer<typeof ForceRoleSchema>;
export const ForceQuantitySchema = z
  .number()
  .int()
  .positive()
  .max(MAX_FORCE_QUANTITY);
export const ForceTermSchema = z.number().int().min(1).max(MAX_FORCE_TERM_DAYS);
const rateSchema = z.number().int().min(0).max(MAX_FORCE_PILLAGE_BPS);

const equipmentItemSchema = z
  .object({
    type: z.enum(['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD']),
    level: z.number().int().min(1).max(20),
  })
  .strict();
export type ForceEquipmentItem = z.infer<typeof equipmentItemSchema>;

/** Per-unit loadout: one known item in every slot this role actually supports. */
export const parseForceLoadout = (
  role: ForceRole,
  input: unknown,
): ForceEquipmentItem[] => {
  const type = ForceRoleSchema.parse(role);
  const equipment = z.array(equipmentItemSchema).min(1).max(6).parse(input);
  const supported = new Set(
    ItemTypes.filter((item) => item.usage === type).map((item) => item.type),
  );
  const slots = new Set(equipment.map((item) => item.type));
  if (
    slots.size !== supported.size ||
    equipment.length !== slots.size ||
    [...supported].some((slot) => !slots.has(slot))
  )
    throw new Error(
      'A contribution needs one item in every supported equipment slot',
    );
  for (const item of equipment) {
    if (
      !ItemTypes.some(
        (known) =>
          known.usage === type &&
          known.type === item.type &&
          known.level === item.level,
      )
    )
      throw new Error('Unknown equipment in force loadout');
  }
  return [...equipment]
    .map(({ type: slot, level }) => ({ type: slot, level }))
    .sort((a, b) => a.type.localeCompare(b.type));
};

export const assertForceTierUnlocked = (
  role: ForceRole,
  level: number,
  fortLevel: number,
) => {
  ForceRoleSchema.parse(role);
  const unit = UnitTypes.find(
    (entry) => entry.type === role && entry.level === level,
  );
  if (
    !unit ||
    !Number.isSafeInteger(fortLevel) ||
    fortLevel < (unit.fortLevel ?? 1)
  )
    throw new Error('Unit tier is not unlocked');
};

export const ForcePolicySchema = z
  .object({
    lendingMode: z.enum(['MANUAL', 'ROLE_ALLOWANCE']).default('MANUAL'),
    roleAllowances: z
      .array(
        z
          .object({
            roleId: z.number().int().positive(),
            maxBorrowed: z.number().int().min(0).max(MAX_FORCE_QUANTITY),
            maxTermDays: ForceTermSchema,
            pillageRateBps: rateSchema,
            loanRateBps: rateSchema,
          })
          .strict(),
      )
      .max(100)
      .default([]),
    enforcement: z
      .object({
        suspendOverdue: z.boolean().default(false),
        autoCollectAfterDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .nullable()
          .default(null),
        fineGold: z
          .string()
          .regex(/^(0|[1-9]\d{0,14})$/)
          .default('0'),
        expelAfterDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .nullable()
          .default(null),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const ids = policy.roleAllowances.map((allowance) => allowance.roleId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate role allowance',
      });
    if (
      policy.enforcement.fineGold !== '0' &&
      policy.enforcement.autoCollectAfterDays === null
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fines require a disclosed collection grace period',
      });
    if (
      policy.enforcement.autoCollectAfterDays !== null &&
      policy.enforcement.expelAfterDays !== null &&
      policy.enforcement.expelAfterDays <=
        policy.enforcement.autoCollectAfterDays
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expulsion must follow the collection grace period',
      });
  });
export type ForcePolicy = z.infer<typeof ForcePolicySchema>;
export const DEFAULT_FORCE_POLICY = ForcePolicySchema.parse({});

const dateMillis = (date: Date) => {
  const value = date.getTime();
  if (!Number.isFinite(value)) throw new Error('Invalid contract timestamp');
  return value;
};

/** Exact expiry is exclusive: a delayed cleanup worker cannot extend a contract. */
export const isForceContractUsable = (
  contract: {
    status: string;
    survivingQuantity: number;
    startsAt: Date | null;
    expiresAt: Date | null;
  },
  now: Date,
): boolean =>
  contract.status === 'ACTIVE' &&
  contract.survivingQuantity > 0 &&
  contract.startsAt !== null &&
  contract.expiresAt !== null &&
  dateMillis(contract.startsAt) <= dateMillis(now) &&
  dateMillis(now) < dateMillis(contract.expiresAt);

export const forceExpiration = (start: Date, days: number): Date =>
  new Date(dateMillis(start) + ForceTermSchema.parse(days) * FORCE_DAY_MS);

/** Contracts are extended from their accepted expiry, never reset from now. */
export const extendForceContract = (
  contract: Parameters<typeof isForceContractUsable>[0] & {
    unitPriceGold: bigint;
  },
  days: number,
  now: Date,
) => {
  if (!isForceContractUsable(contract, now))
    throw new Error('Contract is no longer active');
  const term = ForceTermSchema.parse(days);
  ForceQuantitySchema.parse(contract.survivingQuantity);
  if (contract.unitPriceGold < 0n) throw new Error('Invalid contract price');
  const expiresAt = forceExpiration(contract.expiresAt, term);
  if (
    expiresAt.getTime() - dateMillis(now) >
    MAX_FORCE_TERM_DAYS * FORCE_DAY_MS
  )
    throw new Error('Extension exceeds maximum contract horizon');
  return {
    expiresAt,
    gold:
      contract.unitPriceGold *
      BigInt(contract.survivingQuantity) *
      BigInt(term),
  };
};

/** Tax only actual pillage; only participating alliance loans can raise the rate. */
export const splitForcePillage = (
  gross: bigint,
  generalRateBps: number,
  participatingLoanRates: readonly number[],
) => {
  if (gross < 0n) throw new Error('Pillage cannot be negative');
  const rateBps = Math.max(
    rateSchema.parse(generalRateBps),
    ...participatingLoanRates.map((rate) => rateSchema.parse(rate)),
  );
  const contribution = (gross * BigInt(rateBps)) / 10_000n;
  return { rateBps, contribution, net: gross - contribution };
};

export type ForceObligation = {
  kind: 'GOLD' | 'TROOPS';
  outstanding: bigint;
  dueAt: Date;
  fineAssessedAt: Date | null;
  finalWarningAt: Date | null;
};

/** Plan enforcement only; callers persist a once-per-tick event with the actual payment. */
export const planForceEnforcement = (
  obligation: ForceObligation,
  settings: ForcePolicy['enforcement'],
  now: Date,
  currentMember: boolean,
  available: bigint,
) => {
  const rules = ForcePolicySchema.parse({ enforcement: settings }).enforcement;
  if (obligation.outstanding < 0n || available < 0n)
    throw new Error('Invalid contribution balance');
  const overdueMs = dateMillis(now) - dateMillis(obligation.dueAt);
  const overdue = currentMember && obligation.outstanding > 0n && overdueMs > 0;
  const collect =
    overdue &&
    rules.autoCollectAfterDays !== null &&
    overdueMs >= rules.autoCollectAfterDays * FORCE_DAY_MS;
  // available is on-hand gold OR explicitly designated eligible equipped troops.
  const payment = collect
    ? available < obligation.outstanding
      ? available
      : obligation.outstanding
    : 0n;
  const remaining = obligation.outstanding - payment;
  const fineGold =
    collect && !obligation.fineAssessedAt ? BigInt(rules.fineGold) : 0n;
  const stillOverdue = overdue && (remaining > 0n || fineGold > 0n);
  return {
    overdue: stillOverdue,
    suspendBorrowing: stillOverdue && rules.suspendOverdue,
    payment,
    remaining,
    fineGold,
    expel:
      overdue &&
      remaining > 0n &&
      rules.expelAfterDays !== null &&
      overdueMs >= rules.expelAfterDays * FORCE_DAY_MS &&
      obligation.finalWarningAt !== null &&
      dateMillis(obligation.finalWarningAt) < dateMillis(now),
  };
};
