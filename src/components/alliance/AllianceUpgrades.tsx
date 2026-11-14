import { Badge, Button, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import panelClasses from '@/components/game/Panels.module.css';
import { StyledTable } from '@/components/game/StyledTable';
import { upgradeRowState } from '@/components/game/UpgradeLedger';
import {
  ALLIANCE_LEVELS,
  type AllianceLevel,
  allianceLevelNameKey,
  getAllianceLevel,
  getNextAllianceLevel,
} from '@/constants/allianceLevels';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import type { Locales } from '@/types/typings';
import { toBigIntSafe } from '@/utils/jsonHelpers';

/** GET /api/alliances/upgrades as the browser receives it (bigint strings). */
export interface AllianceUpgradeStatusView {
  allianceId: number;
  status: string;
  hallLevel: number;
  memberCount: number;
  treasury: string | bigint;
  canUpgrade: boolean;
  deposits: { used: number; limit: number; nextSlotAt: string | null };
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load upgrades (${res.status})`);
  return res.json();
};

/** Shared status for the Upgrades tab, the deposit form and the invite panel. */
export const useAllianceUpgradeStatus = (allianceId: number | null) =>
  useSWR<AllianceUpgradeStatusView>(
    allianceId ? `/api/alliances/upgrades?allianceId=${allianceId}` : null,
    fetcher,
  );

/** Why the next level cannot be bought, or null when it can. */
export const purchaseBlocker = (
  next: AllianceLevel,
  status: Pick<
    AllianceUpgradeStatusView,
    'memberCount' | 'treasury' | 'canUpgrade' | 'status'
  >,
): 'reserved' | 'permission' | 'members' | 'gold' | null => {
  if (status.status === 'RESERVED') return 'reserved';
  if (!status.canUpgrade) return 'permission';
  if (status.memberCount < next.minMembers) return 'members';
  if (toBigIntSafe(status.treasury) < next.cost) return 'gold';
  return null;
};

interface AllianceUpgradesViewProps {
  status: AllianceUpgradeStatusView;
  /** Resolves when the purchase settles; the view shows the confirmation. */
  onBuy: (level: number) => Promise<unknown>;
}

/** Alliance Hall ledger: every level's cost, requirement and limits. */
export const AllianceUpgradesView = ({
  status,
  onBuy,
}: AllianceUpgradesViewProps) => {
  const { t, i18n } = useTranslation('alliances');
  const locale = i18n.language as Locales;
  // Whole numbers in full: toLocale abbreviates big values ("2.000 Billion").
  const formatWhole = (value: number | bigint | string) =>
    Number(value).toLocaleString(locale || undefined);
  const [confirming, setConfirming] = useState<AllianceLevel | null>(null);
  const [buying, setBuying] = useState(false);

  const current = getAllianceLevel(status.hallLevel);
  const next = getNextAllianceLevel(current.level);
  const levelName = (level: AllianceLevel) =>
    t(allianceLevelNameKey(level.level), level.name);
  const gold = (value: bigint | string | number) =>
    t('currency.goldAmount', {
      ns: 'common',
      amount: formatWhole(toBigIntSafe(value)),
    });
  const treasury = toBigIntSafe(status.treasury);
  const blocker = next ? purchaseBlocker(next, status) : null;

  const blockerText = (level: AllianceLevel) => {
    switch (blocker) {
      case 'reserved':
        return t('upgrades.blockReserved');
      case 'permission':
        return t('upgrades.blockPermission');
      case 'members':
        return t('upgrades.blockMembers', {
          need: level.minMembers,
          have: status.memberCount,
        });
      case 'gold':
        return t('upgrades.blockGold', {
          missing: formatWhole(level.cost - treasury),
        });
      default:
        return null;
    }
  };

  const confirm = async () => {
    if (!confirming || buying) return;
    setBuying(true);
    try {
      await onBuy(confirming.level);
    } finally {
      setBuying(false);
      setConfirming(null);
    }
  };

  const summary = [
    {
      label: t('upgrades.currentLevel'),
      value: t('upgrades.levelLabel', {
        name: levelName(current),
        level: current.level,
      }),
    },
    {
      label: t('upgrades.members'),
      value: t('upgrades.ofCap', {
        value: formatWhole(status.memberCount),
        cap: formatWhole(current.maxMembers),
      }),
    },
    {
      label: t('upgrades.treasury'),
      value: t('upgrades.ofCap', {
        value: formatWhole(treasury),
        cap: formatWhole(current.treasuryCap),
      }),
    },
    {
      label: t('upgrades.yourDeposits'),
      value: t('upgrades.ofCap', {
        value: formatWhole(status.deposits.used),
        cap: formatWhole(status.deposits.limit),
      }),
    },
  ];

  return (
    <GameCard title={t('upgrades.title')}>
      <Stack gap="md">
        <Text size="sm" c="var(--ot-muted)">
          {t('upgrades.intro')}
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
          {summary.map((item) => (
            <Stack
              key={item.label}
              gap={2}
              p="sm"
              className={panelClasses.insetRow}
            >
              <Text size="xs" c="var(--ot-muted)">
                {item.label}
              </Text>
              <Text fw={700} c="var(--ot-heading)">
                {item.value}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>

        <StyledTable
          ariaLabel={t('upgrades.title')}
          minWidth={760}
          headers={[
            t('upgrades.colLevel'),
            t('upgrades.colCost'),
            t('upgrades.colNeedsMembers'),
            t('upgrades.colMaxMembers'),
            t('upgrades.colDeposits'),
            t('upgrades.colTreasuryCap'),
            t('labels.action', { ns: 'common' }),
          ]}
        >
          {ALLIANCE_LEVELS.map((level) => {
            const state = upgradeRowState(
              level.level,
              current.level,
              status.memberCount >= level.minMembers,
            );
            const isNext = next?.level === level.level;
            const reason = isNext ? blockerText(level) : null;
            return (
              <Table.Tr key={level.level} data-state={state}>
                <Table.Td>
                  {/* Badge under the name: side by side, the name broke
                      into one word per line and a shrunk badge read "OW...". */}
                  <Stack gap={4} align="flex-start">
                    <Text fw={600}>
                      {t('upgrades.levelLabel', {
                        name: levelName(level),
                        level: level.level,
                      })}
                    </Text>
                    {state === 'owned' && (
                      // max-content: on a phone the narrow column cut the
                      // badge to "IM BES..." instead of widening.
                      <Badge color="yellow" style={{ minWidth: 'max-content' }}>
                        {t('labels.owned', { ns: 'common' })}
                      </Badge>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {level.cost > 0n ? gold(level.cost) : '—'}
                </Table.Td>
                <Table.Td>{formatWhole(level.minMembers)}</Table.Td>
                <Table.Td>{formatWhole(level.maxMembers)}</Table.Td>
                <Table.Td>{formatWhole(level.depositsPer24h)}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {gold(level.treasuryCap)}
                </Table.Td>
                <Table.Td>
                  {isNext && (
                    <Stack gap={4} align="flex-start">
                      <Button
                        size="xs"
                        disabled={reason !== null}
                        onClick={() => setConfirming(level)}
                        aria-describedby={
                          reason
                            ? `alliance-upgrade-reason-${level.level}`
                            : undefined
                        }
                      >
                        {t('labels.buy', { ns: 'common' })}
                      </Button>
                      {reason && (
                        <Text
                          id={`alliance-upgrade-reason-${level.level}`}
                          size="xs"
                          c="var(--ot-muted)"
                        >
                          {reason}
                        </Text>
                      )}
                    </Stack>
                  )}
                  {!isNext && level.level > current.level && (
                    <Text size="xs" c="var(--ot-muted)">
                      {t('upgrades.unlockAfter', {
                        name: levelName(ALLIANCE_LEVELS[level.level - 1]),
                      })}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </StyledTable>

        <Text size="xs" c="var(--ot-muted)">
          {next ? t('upgrades.footnote') : t('upgrades.maxed')}
        </Text>
      </Stack>

      <ConfirmationModal
        isOpen={confirming !== null}
        onClose={() => !buying && setConfirming(null)}
        onConfirm={confirm}
        type="primary"
        title={t('upgrades.confirmTitle')}
        message={
          confirming
            ? t('upgrades.confirmMessage', {
                name: levelName(confirming),
                level: confirming.level,
                cost: formatWhole(confirming.cost),
              })
            : undefined
        }
        confirmText={t('labels.buy', { ns: 'common' })}
        cancelText={t('manage.cancel', 'Cancel')}
        isLoading={buying}
      />
    </GameCard>
  );
};

interface AllianceUpgradesProps {
  alliance: AllianceInfo;
  onUpdate?: () => void;
}

/** Upgrades tab: loads the hall status and buys the next level. */
export const AllianceUpgrades = ({
  alliance,
  onUpdate,
}: AllianceUpgradesProps) => {
  const { t } = useTranslation('alliances');
  const { data, error, mutate } = useAllianceUpgradeStatus(alliance.id);

  if (error) {
    return (
      <Text c="red" role="alert">
        {t('upgrades.loadError')}
      </Text>
    );
  }
  if (!data) return null;

  const buy = async (level: number) => {
    try {
      await allianceRequest('/api/alliances/upgrades/purchase', {
        allianceId: alliance.id,
        level,
      });
      alertService.success(
        t('upgrades.bought', {
          name: t(allianceLevelNameKey(level), ALLIANCE_LEVELS[level]?.name),
        }),
      );
    } catch (err) {
      alertService.error((err as Error).message);
    } finally {
      await mutate();
      onUpdate?.();
    }
  };

  return <AllianceUpgradesView status={data} onBuy={buy} />;
};
