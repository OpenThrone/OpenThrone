import { z } from 'zod';

import { isAdmin } from '@/utils/authorization';

export const BroadcastSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  recipientUserIds: z.array(z.number().int().positive()).max(1000).optional(),
  sendToAll: z.boolean().default(false),
  activeWithinDays: z.number().int().min(1).max(36500).optional(),
  channel: z.enum(['IN_GAME', 'EMAIL', 'BOTH']).default('IN_GAME'),
  idempotencyKey: z.string().uuid().optional(),
  action: z.enum(['preview', 'count', 'test', 'send']).default('send'),
});
export function requiresAdministratorForBroadcast(
  body: z.infer<typeof BroadcastSchema>,
) {
  return (
    body.channel !== 'IN_GAME' &&
    (body.sendToAll || body.activeWithinDays !== undefined)
  );
}
/** The route guard separately requires SEND_MASS_MESSAGES for every channel. */
export async function canSendBroadcast(
  actorId: number,
  body: z.infer<typeof BroadcastSchema>,
) {
  return !requiresAdministratorForBroadcast(body) || (await isAdmin(actorId));
}
