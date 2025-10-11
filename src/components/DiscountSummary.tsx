import React, { useMemo } from 'react';
import { Tooltip, Text, ActionIcon } from '@mantine/core';
import { BiInfoCircle } from 'react-icons/bi';
import toLocale from '@/utils/numberFormatting';

interface DiscountEntry {
  label: string;
  percent: number;
}

interface Props {
  user: any | null; // lightweight to avoid circular types; expects UserModel-like facade
  baseCost: number;
  discountedCost: number;
}

const DiscountSummary: React.FC<Props> = ({ user, baseCost, discountedCost }) => {
  const totalPct = user?.priceBonus ?? 0;

  const breakdown = useMemo(() => {
    if (!user) return [] as DiscountEntry[];
    const player = (user.playerBonuses || []).filter((b: any) => b.bonusType === 'PRICES')
      .map((b: any, idx: number) => ({ label: `${String(b.race || b.bonusType)}`, percent: b.bonusAmount ?? 0 }));
    const points = (user.bonus_points || []).filter((p: any) => p.type === 'PRICES')
      .map((p: any) => ({ label: `Proficiency Points`, percent: p.level ?? 0 }));
    return [...player, ...points] as DiscountEntry[];
  }, [user]);

  if (!user || (!breakdown.length && totalPct === 0)) return null;

  return (
    <Tooltip
      withArrow
      label={(
        <div style={{ minWidth: 220 }}>
          <Text size="sm" fw={600} mb={6}>Discount breakdown — total {Number(totalPct).toFixed(2)}%</Text>
          {breakdown.length > 0 ? breakdown.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text size="sm">{d.label}</Text>
              <Text size="sm" fw={600}>{Number(d.percent).toFixed(2)}%</Text>
            </div>
          )) : <Text size="sm" c="dimmed">No individual sources (total shown)</Text>}
          <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.06)', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text size="sm" c="dimmed">Original</Text>
            <Text size="sm" style={{ textDecoration: 'line-through' }}>{toLocale(baseCost)}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text size="sm" c="dimmed">Discounted</Text>
            <Text size="sm" fw={700}>{toLocale(discountedCost)}</Text>
          </div>
        </div>
      )}
    >
      <div>
        <ActionIcon size="xs" variant="light" aria-label="Show discount details">
          <BiInfoCircle />
        </ActionIcon>
      </div>
    </Tooltip>
  );
};

export default DiscountSummary;
