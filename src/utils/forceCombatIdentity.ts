import type { PlayerUnit } from '@/types/typings';

/** Explicit snapshot allowlist; equipment stays bound to its contract in replays. */
export function forceCombatIdentity(unit: {
  type: string;
  forceContractId?: number;
  forceKind?: 'MERCENARY' | 'ALLIANCE';
  forceEquipment?: Array<{ type: string; level: number }>;
}) {
  if (!unit.forceContractId) return {};
  return {
    forceContractId: unit.forceContractId,
    forceKind: unit.forceKind,
    forceEquipment: unit.forceEquipment?.map(({ type, level }) => ({
      type,
      level,
    })),
  } satisfies Partial<PlayerUnit>;
}
