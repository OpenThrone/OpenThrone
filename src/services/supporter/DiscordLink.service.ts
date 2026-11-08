import { createHash, randomBytes } from 'node:crypto';

import prisma from '@/lib/prisma';
import {
  allowedInstantAlerts,
  INSTANT_ALERTS,
} from '@/services/discord/DiscordAlerts.service';
import type { DiscordLinkInfo, DiscordNotifyPrefs } from '@/types/supporter';

const defaults: DiscordNotifyPrefs = {
  dailyDigest: false,
  attacks: false,
  spyHits: false,
  wars: false,
  turnCap: false,
  quietHoursStart: null,
  quietHoursEnd: null,
};
export async function getLinkInfo(userId: number): Promise<DiscordLinkInfo> {
  const [link, allowed] = await Promise.all([
    prisma.discordLink.findUnique({ where: { userId } }),
    allowedInstantAlerts(userId),
  ]);
  const prefs = {
    ...defaults,
    ...((link?.notifyPrefs as Partial<DiscordNotifyPrefs>) ?? {}),
  };
  for (const key of INSTANT_ALERTS)
    if (!allowed.includes(key)) prefs[key] = false;
  return {
    linked: !!link,
    discordUsername: link?.discordUsername ?? null,
    linkedAt: link?.linkedAt.toISOString() ?? null,
    notifyPrefs: prefs,
    allowedAlerts: allowed,
  };
}
export async function createLinkCode(userId: number) {
  const code = randomBytes(6).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 600_000);
  await prisma.discordLinkCode.create({
    data: {
      userId,
      codeHash: createHash('sha256').update(code).digest('hex'),
      expiresAt,
    },
  });
  return { code, expiresAt: expiresAt.toISOString() };
}
export async function updatePrefs(userId: number, prefs: DiscordNotifyPrefs) {
  for (const key of [
    'dailyDigest',
    'attacks',
    'spyHits',
    'wars',
    'turnCap',
  ] as const)
    if (typeof prefs[key] !== 'boolean')
      throw new Error('Invalid notification preferences');
  for (const key of ['quietHoursStart', 'quietHoursEnd'] as const)
    if (
      prefs[key] !== null &&
      (!Number.isInteger(prefs[key]) || prefs[key]! < 0 || prefs[key]! > 23)
    )
      throw new Error('Invalid quiet hours');
  const allowed = await allowedInstantAlerts(userId);
  for (const key of INSTANT_ALERTS)
    if (!allowed.includes(key)) prefs[key] = false;
  await prisma.discordLink.update({
    where: { userId },
    data: { notifyPrefs: { ...prefs } },
  });
  return getLinkInfo(userId);
}
export async function unlink(userId: number) {
  await prisma.discordLink.deleteMany({ where: { userId } });
  return getLinkInfo(userId);
}
