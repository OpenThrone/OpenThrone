import {
  faArrowUpRightFromSquare,
  faScrewdriverWrench,
  faShieldAlt,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Group, Text, ThemeIcon, Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

import { Fortifications } from '@/constants';
import type UserModel from '@/models/Users';
import { alertService } from '@/services/Alert.service';
import { toLocale } from '@/utils/numberFormatting';

export interface FortRepairComputation {
  maxHp: number;
  currentHp: number;
  percentage: number;
  isDamaged: boolean;
  missingHp: number;
  costPerPoint: number;
  affordableHp: number;
  maxRepairable: number;
  repairCost: bigint;
  canRepair: boolean;
  formattedHealth: string;
}

export function computeFortRepairMax(user?: {
  fortLevel?: number;
  fortHitpoints?: number;
  fortHealth?: { current: number; max: number; percentage: number };
  gold?: bigint | number | string;
}): FortRepairComputation {
  if (!user) {
    return {
      maxHp: 0,
      currentHp: 0,
      percentage: 100,
      isDamaged: false,
      missingHp: 0,
      costPerPoint: 5,
      affordableHp: 0,
      maxRepairable: 0,
      repairCost: 0n,
      canRepair: false,
      formattedHealth: 'N/A',
    };
  }

  const fortification = Fortifications.find((f) => f.level === user.fortLevel);
  const maxHp = user.fortHealth?.max ?? fortification?.hitpoints ?? 0;
  const currentHp = user.fortHealth?.current ?? user.fortHitpoints ?? 0;
  const percentage =
    user.fortHealth?.percentage ??
    (maxHp > 0 ? Math.floor((currentHp / maxHp) * 100) : 100);

  const isDamaged = maxHp > 0 && currentHp < maxHp;
  const missingHp = Math.max(0, maxHp - currentHp);
  const costPerPoint = fortification?.costPerRepairPoint ?? 5;
  const costPerPointBig = BigInt(costPerPoint);

  let userGoldBig = 0n;
  try {
    userGoldBig = BigInt(user.gold ?? 0);
  } catch {
    userGoldBig = 0n;
  }

  const affordableHp =
    costPerPointBig > 0n ? Number(userGoldBig / costPerPointBig) : 0;
  const maxRepairable = Math.min(missingHp, affordableHp);
  const repairCost = BigInt(maxRepairable) * costPerPointBig;
  const canRepair = isDamaged && maxRepairable > 0;

  const formattedHealth =
    maxHp > 0 ? `${currentHp}/${maxHp} (${percentage}%)` : 'N/A';

  return {
    maxHp,
    currentHp,
    percentage,
    isDamaged,
    missingHp,
    costPerPoint,
    affordableHp,
    maxRepairable,
    repairCost,
    canRepair,
    formattedHealth,
  };
}

export interface FortHealthStatSlotProps {
  user: UserModel;
  onRepaired?: () => void;
}

export const FortHealthStatSlot: React.FC<FortHealthStatSlotProps> = ({
  user,
  onRepaired,
}) => {
  const { t } = useTranslation('home');
  const [isRepairing, setIsRepairing] = useState(false);

  const {
    isDamaged,
    affordableHp,
    maxRepairable,
    repairCost,
    formattedHealth,
  } = computeFortRepairMax(user);

  const handleRepairMax = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isRepairing || maxRepairable <= 0) return;

    setIsRepairing(true);
    try {
      const response = await fetch('/api/account/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairPoints: maxRepairable }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Repair failed');
      }
      alertService.success(
        data.message ||
          t('overview.repairSuccess', 'Fortification repaired successfully!'),
      );
      if (onRepaired) {
        onRepaired();
      }
    } catch (error: unknown) {
      alertService.error((error as Error).message);
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      justify="space-between"
      data-testid="stat-slot"
      data-stat="fortHealth"
      style={{
        backgroundColor: 'var(--ot-inset)',
        borderRadius: '6px',
        border: '1px solid var(--ot-line)',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        padding: '12px',
        alignItems: 'center',
        minHeight: '66px',
      }}
    >
      <Link
        href="/structures/repair"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: 0,
          flex: 1,
        }}
        data-testid="fort-health-link"
      >
        <ThemeIcon
          c="white"
          variant="light"
          color={isDamaged ? 'orange' : undefined}
          style={{ flexShrink: 0 }}
        >
          <FontAwesomeIcon icon={faShieldAlt} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap" align="center">
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              tt="uppercase"
              style={{ letterSpacing: '0.1em' }}
              data-testid="stat-label"
            >
              {t('overview.fortHealth')}
            </Text>
            {isDamaged && (
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                style={{ fontSize: 10, color: 'var(--ot-muted)' }}
              />
            )}
          </Group>
          <Group gap={8} wrap="nowrap" align="center">
            <Text
              size="sm"
              fw={700}
              style={{ color: 'var(--ot-accent)' }}
              data-testid="stat-value"
            >
              {formattedHealth}
            </Text>
            {isDamaged && (
              <Text
                size="xs"
                c="dimmed"
                td="underline"
                style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
              >
                {t('overview.fortPageLink', 'Fort Page')}
              </Text>
            )}
          </Group>
        </div>
      </Link>

      {isDamaged && (
        <Tooltip
          label={
            affordableHp === 0
              ? t('overview.notEnoughGoldToRepair', 'Not enough gold to repair')
              : t('overview.repairMaxTooltip', {
                  hp: maxRepairable,
                  cost: toLocale(repairCost, user.locale),
                  defaultValue: `Repair ${maxRepairable} HP for ${toLocale(repairCost, user.locale)} gold`,
                })
          }
          withArrow
          position="top"
        >
          <span>
            <Button
              size="xs"
              variant="light"
              color="yellow"
              loading={isRepairing}
              disabled={isRepairing || maxRepairable === 0}
              onClick={handleRepairMax}
              leftSection={
                <FontAwesomeIcon
                  icon={faScrewdriverWrench}
                  style={{ fontSize: 11 }}
                />
              }
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
              data-testid="fort-repair-max-btn"
            >
              {t('overview.repairMax', 'Repair Max')}
            </Button>
          </span>
        </Tooltip>
      )}
    </Group>
  );
};

export default FortHealthStatSlot;
