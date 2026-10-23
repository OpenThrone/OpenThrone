import { z } from 'zod';

import { FRIEND_TRANSFER_NOTE_MAX_LENGTH } from '@/constants/FriendTransfer';

const NOTE_TOO_LONG = `must be ${FRIEND_TRANSFER_NOTE_MAX_LENGTH} characters or fewer`;

/** Id query schema. */
export const IdQuerySchema = z.object({
  id: z.string().pipe(z.coerce.number()),
});

/** Register schema. */
export const RegisterSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' }),
  display_name: z
    .string()
    .min(1)
    .max(50, { message: 'Display name must be 1-50 characters' }),
  race: z.enum(['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'], {
    message: 'Invalid race',
  }),
  class: z.enum(['FIGHTER', 'CLERIC', 'ASSASSIN', 'THIEF'], {
    message: 'Invalid class',
  }),
  turnstileToken: z
    .string()
    .min(1, { message: 'Turnstile token required' })
    .optional(),
});

/** Attack schema. */
export const AttackSchema = z.object({
  turns: z.number().int().positive().max(10, { message: 'Turns must be 1-10' }),
  /** Acknowledges that the target is a fellow member of one of the attacker's alliances. */
  confirmAllianceAttack: z.boolean().optional(),
});

const SpySchema = z.object({
  type: z.enum(['INTEL', 'ASSASSINATE', 'INFILTRATE'], {
    message: 'Invalid spy type',
  }),
  spies: z.number().int().positive().max(10, { message: 'Spies must be 1-10' }),
  unit: z.string().optional(),
});

/** Recruit schema. */
export const RecruitSchema = z.object({
  captchaToken: z.string().optional(),
  recruitedUserId: z
    .union([z.number().int().positive(), z.string()])
    .optional(),
  selfRecruit: z.boolean().optional(),
  sessionId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) =>
      val === undefined || val === null ? null : String(val),
    ),
});

const WithdrawSchema = z.object({
  withdrawAmount: z
    .string()
    .pipe(z.coerce.bigint({ required_error: 'Invalid amount' }))
    .refine((val) => val > BigInt(0), {
      message: 'Withdraw amount must be positive',
    }),
});

const UserUpdateSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  // TODO: Add other common fields
});

/** Gold transfer schema. */
export const GoldTransferSchema = z.object({
  amount: z
    .string()
    .pipe(z.coerce.bigint())
    .refine((val) => val > BigInt(0), {
      message: 'Transfer amount must be positive',
    })
    .refine((val) => val <= BigInt(Number.MAX_SAFE_INTEGER), {
      message: 'Amount too large',
    })
    .transform((val) => val.toString()),
  notes: z
    .string()
    .max(FRIEND_TRANSFER_NOTE_MAX_LENGTH, { message: `Notes ${NOTE_TOO_LONG}` })
    .optional(),
});

/** Gold request schema. */
export const GoldRequestSchema = z.object({
  amount: z
    .string()
    .pipe(z.coerce.bigint())
    .refine((val) => val > BigInt(0), {
      message: 'Request amount must be positive',
    })
    .refine((val) => val <= BigInt(Number.MAX_SAFE_INTEGER), {
      message: 'Amount too large',
    })
    .transform((val) => val.toString()),
  friendId: z.number().int().positive(),
  notes: z
    .string()
    .max(FRIEND_TRANSFER_NOTE_MAX_LENGTH, {
      message: `Reason ${NOTE_TOO_LONG}`,
    })
    .optional(),
});

const GoldRequestResponseSchema = z.object({
  action: z.enum(['accept', 'decline']),
  message: z
    .string()
    .max(FRIEND_TRANSFER_NOTE_MAX_LENGTH, {
      message: `Message ${NOTE_TOO_LONG}`,
    })
    .optional(),
});
