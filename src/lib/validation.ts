import { z } from 'zod';

export const IdQuerySchema = z.object({
  id: z.string().pipe(z.coerce.number()),
});

export const RegisterSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  display_name: z.string().min(1).max(50, { message: 'Display name must be 1-50 characters' }),
  race: z.enum(['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'], { message: 'Invalid race' }),
  class: z.string().optional(),
  turnstileToken: z.string().min(1, { message: 'Turnstile token required' }),
});

export const AttackSchema = z.object({
  turns: z.number().int().positive().max(10, { message: 'Turns must be 1-10' }),
});

export const SpySchema = z.object({
  type: z.enum(['INTEL', 'ASSASSINATE', 'INFILTRATE'], { message: 'Invalid spy type' }),
  spies: z.number().int().positive().max(10, { message: 'Spies must be 1-10' }),
  unit: z.string().optional(),
});

export const RecruitSchema = z.object({
  recruitedUserId: z.union([z.number().int().positive(), z.string()]).optional(),
  selfRecruit: z.boolean().optional(),
  sessionId: z.string().optional(),
});

export const WithdrawSchema = z.object({
  withdrawAmount: z.string().pipe(z.coerce.bigint({ required_error: 'Invalid amount' })).refine((val) => val > BigInt(0), { message: 'Withdraw amount must be positive' }),
});

export const UserUpdateSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  // TODO: Add other common fields
});