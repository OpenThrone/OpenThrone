import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { DEFAULT_ABUSE_CONFIG } from '@/constants/abuseSignals';
import {
  ALTCHA_DIFFICULTY_DEFAULT,
  isRuntimeSettingKey,
  RUNTIME_SETTING_KEYS,
  RUNTIME_SETTING_REGISTRY,
  validateRuntimeSettingConsistency,
} from '@/constants/runtimeSettings';
import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  getRuntimeConfig,
  invalidateRuntimeConfigCache,
  type RuntimeConfig,
} from '@/services/RuntimeConfig.service';
import { ServerSettingService } from '@/services/ServerSetting.service';
import { settleStaminaSettings } from '@/services/Stamina.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import {
  ERA_TRANSACTION_OPTIONS,
  lockEraLifecycle,
} from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';
import { DEFAULT_STAMINA_RULES } from '@/utils/stamina';

const Schema = z.object({
  key: z.string().min(1),
  value: z.unknown().optional(),
  revertAuditId: z.number().int().positive().optional(),
});
const guardedHandler = withApiGuard({
  methods: ['GET', 'PUT', 'DELETE'],
  authMode: 'permission',
  requiredAnyPermissions: [PermissionType.MANAGE_SERVER_SETTINGS],
  rateLimitProfile: 'admin',
  bodySchema: Schema,
});

function runtimeValue(config: RuntimeConfig, key: string): unknown {
  const abuse = config.abuse ?? DEFAULT_ABUSE_CONFIG;
  const values: Record<string, unknown> = {
    'account.inactivity.remindersEnabled':
      config.inactivityRemindersEnabled ?? false,
    'account.inactivity.autoAnonymizeEnabled':
      config.inactivityAutoAnonymizeEnabled ?? false,
    'email.outbox.enabled': config.emailOutboxEnabled ?? false,
    'email.outbox.ratePerMinute': config.emailOutboxRatePerMinute ?? 60,
    'recruit.dailyCap': config.externalRecruitDailyCap ?? 25,
    'recruit.internalDailyCap': config.recruitDailyCap ?? 250,
    'recruit.externalIpDailyCap': config.externalRecruitIpDailyCap ?? 5,
    'recruit.captchaProvider': config.recruitCaptchaProvider ?? 'altcha',
    'recruit.altchaDifficulty':
      config.recruitAltchaDifficulty ?? ALTCHA_DIFFICULTY_DEFAULT,
    'era.protectionDurationDays': config.protectionDurationDays ?? 14,
    'mercenary.hireMultiplier': config.mercenaryHireMultiplier,
    'mercenary.dailyPriceRate': config.mercenaryDailyPriceRate,
    'combat.pairDailyLimit': config.pairDailyLimit,
    'era.protectionLevelLimit': config.protectionLevelLimit,
    'bank.depositCapPercent': config.depositCapPercent,
    'friend.dailyReceivedCap': config.friendDailyReceivedCap,
    'friend.transferMinLevel': config.friendTransferMinLevel,
    'friend.requestCooldownDays': config.friendRequestCooldownDays,
    'friend.requestMaxDeclines': config.friendRequestMaxDeclines,
    'friend.requestDailyCap': config.friendRequestDailyCap,
    'alliance.maxPendingGoldRequests': config.maxPendingGoldRequests,
    'force.maxQuantity': config.forceMaxQuantity,
    'force.maxTermDays': config.forceMaxTermDays,
    'force.maxPillageBps': config.forceMaxPillageBps,
    'alliance.loanTermMinDays': config.allianceLoanTermMinDays,
    'alliance.loanTermMaxDays': config.allianceLoanTermMaxDays,
    'alliance.loanInterestMaxPercent': config.allianceLoanInterestMaxPercent,
    'alliance.memberDailyCapMin': config.allianceMemberDailyCapMin,
    'alliance.memberDailyCapMax': config.allianceMemberDailyCapMax,
    'alliance.loanIncomeSharePercent': config.allianceLoanIncomeSharePercent,
    'alliance.reactivationMinLevel': config.allianceReactivationMinLevel,
    'alliance.reactivationCostGold': config.allianceReactivationCostGold,
    'abuse.enabled': abuse.enabled,
    'abuse.network.minAccounts': abuse.network.minAccounts,
    'abuse.network.windowDays': abuse.network.windowDays,
    'abuse.funnel.windowDays': abuse.funnel.windowDays,
    'abuse.funnel.minSources': abuse.funnel.minSources,
    'abuse.funnel.minSharePercent': abuse.funnel.minSharePercent,
    'abuse.funnel.minGold': abuse.funnel.minGold,
    'abuse.funnel.minActionsPerSource': abuse.funnel.minActionsPerSource,
    'abuse.pingPong.minTransfersEachWay': abuse.pingPong.minTransfersEachWay,
    'abuse.pingPong.minGoldEachWay': abuse.pingPong.minGoldEachWay,
    'abuse.bot.minHoursPerDay': abuse.bot.minHoursPerDay,
    'abuse.bot.minDays': abuse.bot.minDays,
    'abuse.bot.minGapSamples': abuse.bot.minGapSamples,
    'abuse.bot.maxVariationPercent': abuse.bot.maxVariationPercent,
    'abuse.fresh.accountAgeDays': abuse.fresh.accountAgeDays,
    'abuse.fresh.windowDays': abuse.fresh.windowDays,
    'abuse.fresh.minAttacks': abuse.fresh.minAttacks,
    'moderation.shadowEnabled': config.moderationShadowEnabled ?? false,
    'moderation.shadowBatchSize': config.moderationShadowBatchSize ?? 25,
    ENABLE_SUPPORTER: config.enableSupporter,
    'stamina.penaltyThreshold': (config.stamina ?? DEFAULT_STAMINA_RULES)
      .penaltyThreshold,
    'stamina.minOffensePercent': (config.stamina ?? DEFAULT_STAMINA_RULES)
      .minOffensePercent,
    'stamina.enabled': (config.stamina ?? DEFAULT_STAMINA_RULES).enabled,
    'stamina.recoveryEnabled': (config.stamina ?? DEFAULT_STAMINA_RULES)
      .recoveryEnabled,
    'stamina.recoveryAmount': (config.stamina ?? DEFAULT_STAMINA_RULES)
      .recoveryAmount,
    'stamina.recoveryIntervalMinutes': (config.stamina ?? DEFAULT_STAMINA_RULES)
      .recoveryIntervalMinutes,
    'stamina.baseCost': (config.stamina ?? DEFAULT_STAMINA_RULES).baseCost,
    'stamina.perTurnCost': (config.stamina ?? DEFAULT_STAMINA_RULES)
      .perTurnCost,
    ENABLE_ATTACKING: config.enableAttacking,
    ATTACK_LEVEL_RANGE: config.attackLevelRange,
    ENABLE_INFILTRATIONS: config.enableInfiltrations,
    ENABLE_ASSASSINATIONS: config.enableAssassinations,
    ENABLE_INTEL: config.enableIntel,
    ENABLE_SOCIAL: config.enableSocial,
    ENABLE_MESSAGING: config.enableMessaging,
    ENABLE_ENEMIES: config.enableEnemies,
    ENABLE_DESERTION: config.enableDesertion,
    ENABLE_REANIMATION: config.enableReanimation,
    ENABLE_GARRISON_FATIGUE: config.enableGarrisonFatigue,
    SHOW_KINGDOM_MORALE: config.showKingdomMorale,
    SHOW_DUNGEON: config.showDungeon,
    ENABLE_SITE_ANALYTICS: config.enableSiteAnalytics,
    DISABLE_LOGIN: config.disableLogin,
    DISABLE_REGISTRATION: config.disableRegistration,
    MAINTENANCE_MODE: config.maintenance,
  };
  // Unknown-to-this-map keys still get a reversible value from the registry.
  return isRuntimeSettingKey(key)
    ? (values[key] ?? RUNTIME_SETTING_REGISTRY[key].fallback)
    : values[key];
}

async function validateLimits(
  tx: Parameters<typeof getRuntimeConfig>[0],
  key: string,
  value: unknown,
) {
  const config = await getRuntimeConfig(tx);
  const effective = (setting: string, current: number) =>
    key === setting ? Number(value) : current;
  validateRuntimeSettingConsistency({
    loanTermMin: effective(
      'alliance.loanTermMinDays',
      config.allianceLoanTermMinDays ?? 1,
    ),
    loanTermMax: effective(
      'alliance.loanTermMaxDays',
      config.allianceLoanTermMaxDays ?? 14,
    ),
    memberCapMin: effective(
      'alliance.memberDailyCapMin',
      config.allianceMemberDailyCapMin ?? 100000,
    ),
    memberCapMax: effective(
      'alliance.memberDailyCapMax',
      config.allianceMemberDailyCapMax ?? 50000000,
    ),
  });
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: { key?: string; historyKey?: string; effective?: string };
    body?: z.infer<typeof Schema>;
  },
) {
  if (req.method === 'GET') {
    if (
      context.query.historyKey &&
      isRuntimeSettingKey(context.query.historyKey)
    ) {
      const logs = await prisma.auditLog.findMany({
        where: {
          action: {
            in: ['ADMIN_SERVER_SETTING_UPDATE', 'ADMIN_SERVER_SETTING_DELETE'],
          },
          entityType: 'ServerSetting',
          details: { path: ['key'], equals: context.query.historyKey },
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: { id: true, timestamp: true, details: true },
      });
      return res.status(200).json(
        logs.map(({ timestamp, ...log }) => ({
          ...log,
          createdAt: timestamp,
        })),
      );
    }
    // What the server runs with right now, including env defaults, so the
    // page never shows a fallback for a setting that has no database row.
    if (context.query.effective) {
      const config = await getRuntimeConfig();
      return res
        .status(200)
        .json(
          Object.fromEntries(
            RUNTIME_SETTING_KEYS.map((key) => [key, runtimeValue(config, key)]),
          ),
        );
    }
    return res.status(200).json(await ServerSettingService.list());
  }
  const userId = Number(req.session?.user?.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (req.method === 'PUT') {
      const { body } = context;
      if (!body)
        return res.status(400).json({ error: 'Setting details required' });
      const { key, revertAuditId } = body;
      if (!isRuntimeSettingKey(key))
        return res.status(400).json({ error: 'Unknown setting key' });
      const meta = RUNTIME_SETTING_REGISTRY[key];
      let nextValue = body.value;
      if (revertAuditId) {
        const prior = await prisma.auditLog.findFirst({
          where: {
            id: revertAuditId,
            action: {
              in: [
                'ADMIN_SERVER_SETTING_UPDATE',
                'ADMIN_SERVER_SETTING_DELETE',
              ],
            },
            entityType: 'ServerSetting',
          },
        });
        const details = prior?.details as {
          key?: string;
          previousValue?: unknown;
        } | null;
        if (
          !prior ||
          !details ||
          details?.key !== key ||
          !Object.prototype.hasOwnProperty.call(details, 'previousValue')
        )
          return res
            .status(400)
            .json({ error: 'No reversible prior value found' });
        nextValue = details.previousValue;
      }
      const parsed = meta.schema.safeParse(nextValue);
      if (!parsed.success)
        return res.status(400).json({ error: 'Invalid value for setting' });
      const result = await prisma.$transaction(
        async (tx) => {
          if (
            key.startsWith('alliance.loanTerm') ||
            key.startsWith('alliance.memberDailyCap')
          ) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(71942018)`;
            await validateLimits(tx, key, parsed.data);
          }
          if (key === 'DISABLE_LOGIN' || key.startsWith('stamina.'))
            await lockEraLifecycle(tx);
          const currentConfig = await getRuntimeConfig(tx);
          if (
            key.startsWith('stamina.') &&
            !Object.is(runtimeValue(currentConfig, key), parsed.data)
          )
            await settleStaminaSettings(tx);
          const previous = await tx.serverSetting.findUnique({
            where: { key },
          });
          const updated = await tx.serverSetting.upsert({
            where: { key },
            create: {
              key,
              label: meta.label,
              type: meta.type,
              value: parsed.data as object,
              isPublic: meta.isPublic,
              isRuntimeEditable: true,
              updatedByUserId: userId,
            },
            update: {
              label: meta.label,
              type: meta.type,
              value: parsed.data as object,
              isPublic: meta.isPublic,
              isRuntimeEditable: true,
              updatedByUserId: userId,
            },
          });
          await logActionStrict(
            {
              userId,
              action: 'ADMIN_SERVER_SETTING_UPDATE',
              ip: getRequestIp(req),
              entityType: 'ServerSetting',
              entityId: updated.id,
              details: {
                key,
                previousValue:
                  previous?.value ?? runtimeValue(currentConfig, key),
                newValue: parsed.data,
                revertedAuditId: revertAuditId ?? null,
              },
            },
            tx,
          );
          return updated;
        },
        key.startsWith('stamina.') ? ERA_TRANSACTION_OPTIONS : undefined,
      );
      invalidateRuntimeConfigCache();
      return res.status(200).json(result);
    }
    const { key } = context.query;
    if (!key || !isRuntimeSettingKey(key))
      return res.status(400).json({ error: 'Unknown setting key' });
    const prior = await ServerSettingService.get(key);
    if (prior) {
      await prisma.$transaction(
        async (tx) => {
          if (
            key.startsWith('alliance.loanTerm') ||
            key.startsWith('alliance.memberDailyCap')
          ) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(71942018)`;
            await validateLimits(
              tx,
              key,
              RUNTIME_SETTING_REGISTRY[key].fallback,
            );
          }
          if (key === 'DISABLE_LOGIN' || key.startsWith('stamina.'))
            await lockEraLifecycle(tx);
          const currentConfig = await getRuntimeConfig(tx);
          if (
            key.startsWith('stamina.') &&
            !Object.is(
              runtimeValue(currentConfig, key),
              RUNTIME_SETTING_REGISTRY[key].fallback,
            )
          )
            await settleStaminaSettings(tx);
          await tx.serverSetting.delete({ where: { key } });
          await logActionStrict(
            {
              userId,
              action: 'ADMIN_SERVER_SETTING_DELETE',
              ip: getRequestIp(req),
              entityType: 'ServerSetting',
              entityId: prior.id,
              details: {
                key,
                previousValue: prior.value ?? runtimeValue(currentConfig, key),
                newValue: null,
              },
            },
            tx,
          );
        },
        key.startsWith('stamina.') ? ERA_TRANSACTION_OPTIONS : undefined,
      );
      invalidateRuntimeConfigCache();
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === 'Minimum setting cannot exceed maximum setting'
    )
      return res.status(400).json({ error: err.message });
    logError('Failed to update server setting', err);
    return res.status(500).json({ error: 'Setting update failed' });
  }
}

export default guardedHandler(handler);
