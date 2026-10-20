import type { AlliancePermissionKey } from '@/constants/alliancePermissions';
import { hasAlliancePermission } from '@/constants/alliancePermissions';
import type { AllianceInfo } from '@/services/Alliance.service';

/** The viewer's leader flag, rank position and permission check. */
export interface AllianceStanding {
  isLeader: boolean;
  rankOrder: number | null;
  can: (key: AlliancePermissionKey) => boolean;
  /** Whether the viewer outranks a rank position (lower number = higher). */
  outranks: (rankOrder: number | null | undefined) => boolean;
}

/** Mirrors the server rules so the UI only offers actions that can succeed. */
export const getAllianceStanding = (
  alliance: AllianceInfo,
  viewerId: number | null,
): AllianceStanding => {
  const isLeader = viewerId != null && alliance.leader_id === viewerId;
  const membership = alliance.members?.find((m) => m.user_id === viewerId);
  const rankOrder = membership?.role?.rank_order ?? null;
  return {
    isLeader,
    rankOrder,
    can: (key) =>
      hasAlliancePermission(
        alliance.leader_id,
        viewerId,
        membership?.role ?? null,
        key,
      ),
    outranks: (target) =>
      isLeader || (rankOrder != null && target != null && target > rankOrder),
  };
};

/** POSTs JSON to an alliance API route and throws the server's error message. */
export const allianceRequest = async (
  url: string,
  body: Record<string, unknown>,
  method = 'POST',
) => {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};
