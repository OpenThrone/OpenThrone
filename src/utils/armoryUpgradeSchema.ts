import { z } from 'zod';

export const ArmoryUpgradeSchema = z.object({
  userId: z.number().int().positive().safe(),
  conversions: z
    .array(
      z.object({
        fromItem: z.string().min(1).max(160),
        toItem: z.string().min(1).max(160),
        conversionAmount: z.number().int().positive().safe(),
      }),
    )
    .min(1)
    .max(100),
});
