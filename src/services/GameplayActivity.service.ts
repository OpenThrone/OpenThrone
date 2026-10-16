import prisma from '@/lib/prisma';
import { logError } from '@/utils/logger';

/**
 * Records that a player took a gameplay action (bank deposit, training,
 * armory purchase or sale, attack, spy mission, fort repair). The daily
 * citizen bonus only goes to accounts active within the configured window.
 * Never throws: a failed stamp must not fail the action it follows.
 */
export async function markGameplayActivity(userId: number): Promise<void> {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  try {
    await prisma.users.update({
      where: { id },
      data: { last_gameplay_at: new Date() },
    });
  } catch (error) {
    logError('Failed to record gameplay activity', { userId: id, error });
  }
}
