import type { ForceWound } from '@/services/Mercenary.service';

/** One stored wounded group, as written by combat into users.wounded_units. */
export type AdminWoundGroup = ForceWound & {
  type?: string;
  level?: number;
  isMercenary?: boolean;
  woundedAt?: string;
};

/** Permanent units to put back on duty after an admin "heal all". */
export type AdminHealRestore = {
  type: string;
  level: number;
  isMercenary: boolean;
  quantity: number;
};

export type AdminHealPlan = {
  restore: AdminHealRestore[];
  /** Wounds on active contracts: removing them restores duty via the roster projection. */
  contractHealed: number;
  /** Wounds on closed contracts; the daily cron drops these too. */
  dropped: number;
};

/**
 * Full-heal counterpart of the cron's daily healing (`computeWoundedHealing`):
 * permanent wounds return to UserUnit rows, active-contract wounds are simply
 * removed (never written to UserUnit), closed-contract wounds are discarded.
 * Same group parsing as the cron, so nothing desyncs `survivingQuantity`.
 */
export function planAdminHealAll(
  wounded: unknown,
  activeContractIds: ReadonlySet<number>,
): AdminHealPlan {
  const groups: AdminWoundGroup[] = Array.isArray(wounded)
    ? (wounded as AdminWoundGroup[])
    : [];
  const merged = new Map<string, AdminHealRestore>();
  let contractHealed = 0;
  let dropped = 0;
  for (const group of groups) {
    const quantity = Math.max(0, Math.floor(Number(group?.quantity ?? 0)));
    if (quantity <= 0) continue;
    if (group.forceContractId) {
      if (activeContractIds.has(group.forceContractId))
        contractHealed += quantity;
      else dropped += quantity;
      continue;
    }
    const type = String(group.type ?? 'CITIZEN');
    const level = Math.max(1, Math.floor(Number(group.level ?? 1)));
    const isMercenary = !!group.isMercenary;
    const key = `${type}:${level}:${isMercenary}`;
    const prior = merged.get(key);
    if (prior) prior.quantity += quantity;
    else merged.set(key, { type, level, isMercenary, quantity });
  }
  return { restore: [...merged.values()], contractHealed, dropped };
}

/** Sums the wounded quantity per contract id (for contract rows in admin views). */
export function woundsByContract(wounded: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (!Array.isArray(wounded)) return out;
  for (const w of wounded as ForceWound[]) {
    if (!w?.forceContractId) continue;
    out.set(
      w.forceContractId,
      (out.get(w.forceContractId) ?? 0) +
        Math.max(0, Math.floor(Number(w.quantity ?? 0))),
    );
  }
  return out;
}

/** Contract states an admin may still close. */
export const ADMIN_CLOSABLE_CONTRACT_STATUSES = [
  'ACTIVE',
  'REQUESTED',
] as const;

export type AdminContractAction = 'EXPIRE' | 'TERMINATE';

/**
 * Status a contract ends in for an admin action: requested loans are
 * cancelled; active ones expire (EXPIRE) or are dismissed (TERMINATE).
 * Returns null when the contract is already closed.
 */
export function adminContractOutcome(
  status: string,
  action: AdminContractAction,
): 'EXPIRED' | 'DISMISSED' | 'CANCELLED' | null {
  if (status === 'REQUESTED') return 'CANCELLED';
  if (status !== 'ACTIVE') return null;
  return action === 'EXPIRE' ? 'EXPIRED' : 'DISMISSED';
}

/** Force mutations an admin can perform; each maps to one required permission. */
export type ForceMutation =
  | { op: 'closeContract'; kind: 'MERCENARY' | 'ALLIANCE' }
  | { op: 'returnForce' }
  | { op: 'waiveObligation' }
  | { op: 'healWounded' };

/**
 * Player-scoped changes need MANAGE_USERS; alliance-scoped ones need
 * MANAGE_ALLIANCES. Reads accept either (enforced by the route guard).
 */
export function forceMutationPermission(
  mutation: ForceMutation,
): 'MANAGE_USERS' | 'MANAGE_ALLIANCES' {
  switch (mutation.op) {
    case 'closeContract':
      return mutation.kind === 'ALLIANCE' ? 'MANAGE_ALLIANCES' : 'MANAGE_USERS';
    case 'returnForce':
      return 'MANAGE_ALLIANCES';
    default:
      return 'MANAGE_USERS';
  }
}

/**
 * Same rule as the Edit Player API: staff may not act on another account
 * that holds an active ADMINISTRATOR role (acting on yourself is allowed).
 */
export function blocksAdminOnAdmin(
  actorId: number,
  targetUserId: number,
  staffRows: ReadonlyArray<{ role: string; revokedAt: Date | null }>,
): boolean {
  if (actorId === targetUserId) return false;
  return staffRows.some(
    (row) => row.role === 'ADMINISTRATOR' && row.revokedAt === null,
  );
}

/**
 * Active alliance deployments whose term has elapsed. Heal-all must return
 * these through `returnForceInTx` before touching wounds, as the force worker
 * would, so their wounded troops reach the reserve's wounded pool.
 */
export function elapsedAllianceContracts<
  T extends {
    kind: string;
    status: string;
    expiresAt: Date | null;
  },
>(contracts: readonly T[], now: Date): T[] {
  return contracts.filter(
    (c) =>
      c.kind === 'ALLIANCE' &&
      c.status === 'ACTIVE' &&
      !!c.expiresAt &&
      c.expiresAt <= now,
  );
}
