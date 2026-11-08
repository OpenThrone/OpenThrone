import { createHash } from 'node:crypto';

import { Fortifications } from '@/constants/Fortifications';
import prisma from '@/lib/prisma';
import { WarStatus } from '@/lib/prisma-exports';
import { discordText, siteUrl } from '@/services/discord/DiscordApi';
import { ensureActiveEra } from '@/services/Era.service';
import { getEraParticipantWhere } from '@/utils/loginPolicy';

/**
 * Slash commands, registered by scripts/discord-register-commands.ts. All
 * replies are ephemeral and read-only; nothing here changes game state except
 * /link, which redeems a code from the settings page.
 */
export const DISCORD_COMMANDS = [
  {
    name: 'link',
    description: 'Link your OpenThrone account with a code from Settings',
    options: [
      {
        type: 3,
        name: 'code',
        description: 'Code from Settings > Discord account',
        required: true,
      },
    ],
  },
  {
    name: 'profile',
    description: 'View a kingdom profile',
    options: [
      { type: 3, name: 'name', description: 'Kingdom name', required: true },
    ],
  },
  { name: 'stats', description: 'Server statistics' },
  { name: 'leaderboard', description: 'Top kingdoms and largest alliances' },
  { name: 'fort', description: 'Your fort status' },
  { name: 'myclan', description: 'Your alliance' },
  { name: 'war', description: "Your alliance's wars" },
] as const;

export type DiscordCommandName = (typeof DISCORD_COMMANDS)[number]['name'];

export interface CommandContext {
  discordUserId: string;
  discordUsername: string;
  locale: string | undefined;
  options: Record<string, string>;
}

const SETTINGS = '/home/settings';
/** Stored as HUMAN / FIGHTER; shown as Human / Fighter. */
const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
const notAnonymized = { NOT: { email: { endsWith: '@deleted.local' } } };

async function linkedUser(discordUserId: string) {
  const link = await prisma.discordLink.findUnique({
    where: { discordUserId },
    select: { userId: true },
  });
  return link?.userId ?? null;
}

async function membershipOf(userId: number) {
  return prisma.alliance_memberships.findFirst({
    where: { user_id: userId },
    select: {
      alliance: {
        select: {
          id: true,
          name: true,
          leader_id: true,
          sponsorship: { select: { activeUntil: true } },
          _count: { select: { members: true } },
        },
      },
    },
  });
}

async function link({
  discordUserId,
  discordUsername,
  locale,
  options,
}: CommandContext) {
  const t = (key: string, vars = {}) => discordText(locale, key, vars);
  const code = (options.code ?? '').trim().toUpperCase();
  const codeHash = createHash('sha256').update(code).digest('hex');
  return prisma.$transaction(async (tx) => {
    const row = await tx.discordLinkCode.findUnique({ where: { codeHash } });
    if (!row || row.usedAt || row.expiresAt <= new Date())
      return t('reply.linkInvalid', { url: siteUrl(SETTINGS) });
    const taken = await tx.discordLink.findUnique({ where: { discordUserId } });
    if (taken && taken.userId !== row.userId) return t('reply.linkTaken');
    // Single use, even when two /link calls race.
    const claimed = await tx.discordLinkCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (!claimed.count)
      return t('reply.linkInvalid', { url: siteUrl(SETTINGS) });
    await tx.discordLink.upsert({
      where: { userId: row.userId },
      create: { userId: row.userId, discordUserId, discordUsername },
      update: { discordUserId, discordUsername, linkedAt: new Date() },
    });
    const user = await tx.users.findUnique({
      where: { id: row.userId },
      select: { display_name: true },
    });
    return t('reply.linked', {
      kingdom: user?.display_name ?? '',
      url: siteUrl(SETTINGS),
    });
  });
}

async function profile({ locale, options }: CommandContext) {
  const t = (key: string, vars = {}) => discordText(locale, key, vars);
  const name = (options.name ?? '').trim().slice(0, 64);
  const user = await prisma.users.findFirst({
    where: {
      display_name: { equals: name, mode: 'insensitive' },
      id: { gt: 0 },
      ...notAnonymized,
    },
    select: {
      id: true,
      display_name: true,
      race: true,
      class: true,
      rank: true,
      supporter_until: true,
      supporterMembership: { select: { badgeVisible: true } },
    },
  });
  if (!user) return t('reply.playerNotFound', { name });
  const membership = await membershipOf(user.id);
  const supporter =
    !!user.supporter_until &&
    user.supporter_until > new Date() &&
    user.supporterMembership?.badgeVisible !== false;
  return t('reply.profile', {
    name: user.display_name,
    badge: supporter ? t('reply.supporterBadge') : '',
    race: titleCase(user.race),
    class: titleCase(user.class),
    rank: user.rank || '—',
    alliance: membership
      ? t('reply.inAlliance', { alliance: membership.alliance.name })
      : '',
    url: siteUrl(`/userprofile/${user.id}`),
  });
}

async function stats({ locale }: CommandContext) {
  const era = await ensureActiveEra();
  const [players, battles, alliances] = await Promise.all([
    prisma.users.count({ where: await getEraParticipantWhere(era) }),
    prisma.attack_log.count({ where: { timestamp: { gte: era.startDate } } }),
    prisma.alliances.count(),
  ]);
  return discordText(locale, 'reply.stats', {
    era: era.name,
    players,
    alliances,
    battles,
  });
}

async function leaderboard({ locale }: CommandContext) {
  const t = (key: string, vars = {}) => discordText(locale, key, vars);
  const era = await ensureActiveEra();
  const [players, alliances] = await Promise.all([
    prisma.users.findMany({
      where: { ...(await getEraParticipantWhere(era)), rank: { gt: 0 } },
      orderBy: { rank: 'asc' },
      take: 10,
      select: { rank: true, display_name: true },
    }),
    prisma.alliances.findMany({
      orderBy: { members: { _count: 'desc' } },
      take: 5,
      select: { name: true, _count: { select: { members: true } } },
    }),
  ]);
  return [
    t('reply.leaderboardPlayers'),
    ...players.map((p) => `${p.rank}. ${p.display_name}`),
    '',
    t('reply.leaderboardAlliances'),
    ...alliances.map((a) =>
      t('reply.leaderboardAllianceRow', {
        name: a.name,
        members: a._count.members,
      }),
    ),
  ].join('\n');
}

async function fort(userId: number, { locale }: CommandContext) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { display_name: true, fort_level: true, fort_hitpoints: true },
  });
  if (!user) return discordText(locale, 'reply.error');
  const level = Fortifications.find((f) => f.level === user.fort_level);
  return discordText(locale, 'reply.fort', {
    kingdom: user.display_name,
    fort: level?.name ?? '',
    level: user.fort_level,
    hp: user.fort_hitpoints,
    maxHp: level?.hitpoints ?? user.fort_hitpoints,
  });
}

async function myclan(userId: number, { locale }: CommandContext) {
  const t = (key: string, vars = {}) => discordText(locale, key, vars);
  const membership = await membershipOf(userId);
  if (!membership) return t('reply.noAlliance');
  const { alliance } = membership;
  const leader = await prisma.users.findUnique({
    where: { id: alliance.leader_id },
    select: { display_name: true },
  });
  const premium =
    !!alliance.sponsorship?.activeUntil &&
    alliance.sponsorship.activeUntil > new Date();
  return t('reply.myclan', {
    name: alliance.name,
    premium: premium ? t('reply.premium') : '',
    members: alliance._count.members,
    leader: leader?.display_name ?? '—',
    url: siteUrl(`/alliances/${alliance.id}`),
  });
}

async function war(userId: number, { locale }: CommandContext) {
  const t = (key: string, vars = {}) => discordText(locale, key, vars);
  const membership = await membershipOf(userId);
  if (!membership) return t('reply.noAlliance');
  const { id } = membership.alliance;
  const wars = await prisma.alliance_wars.findMany({
    where: {
      OR: [{ attacker_alliance_id: id }, { defender_alliance_id: id }],
      status: { in: [WarStatus.WARMUP, WarStatus.ACTIVE] },
    },
    orderBy: { start_at: 'asc' },
    take: 10,
    select: {
      status: true,
      start_at: true,
      attacker_alliance: { select: { name: true } },
      defender_alliance: { select: { name: true } },
      defender_user: { select: { display_name: true } },
    },
  });
  if (!wars.length)
    return t('reply.noWars', { alliance: membership.alliance.name });
  return wars
    .map((w) =>
      t('reply.warRow', {
        attacker: w.attacker_alliance.name,
        defender: w.defender_alliance?.name ?? w.defender_user?.display_name,
        status: w.status.toLowerCase(),
        start: w.start_at.toISOString().slice(0, 10),
      }),
    )
    .join('\n');
}

/** Returns the reply text for one slash command. */
export async function runDiscordCommand(
  name: string,
  context: CommandContext,
): Promise<string> {
  const t = (key: string, vars = {}) => discordText(context.locale, key, vars);
  if (name === 'link') return link(context);
  if (name === 'profile') return profile(context);
  if (name === 'stats') return stats(context);
  if (name === 'leaderboard') return leaderboard(context);
  if (!['fort', 'myclan', 'war'].includes(name))
    return t('reply.unknownCommand');
  const userId = await linkedUser(context.discordUserId);
  if (!userId) return t('reply.notLinked', { url: siteUrl(SETTINGS) });
  if (name === 'fort') return fort(userId, context);
  if (name === 'myclan') return myclan(userId, context);
  return war(userId, context);
}
