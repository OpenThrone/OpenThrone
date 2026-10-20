/** Client-safe shape of the signed-in recruiter's daily recruitment allowance. */
export type RecruitmentBlockReason =
  | 'RECRUITER_DAILY_CAP_REACHED'
  | 'TARGET_DAILY_CAP_REACHED'
  | 'PAIR_LIMIT_REACHED';

export interface RecruitmentTargetStatus {
  /** Times the recruiter has recruited with this player today. */
  pairUsed: number;
  /** Times anyone has recruited with this player today. */
  targetUsed: number;
}

export interface RecruitmentStatus {
  pairLimit: number;
  recruiterCap: number;
  targetCap: number;
  /** Recruits the signed-in player has claimed today across all players. */
  recruiterUsed: number;
  /** ISO time the daily counts reset (next OT midnight). */
  resetsAt: string;
  targets: Record<string, RecruitmentTargetStatus>;
}

/** Mirrors getRecruitmentBlock: the recruiter's own cap is reported first. */
export function recruitmentBlockFor(
  status: RecruitmentStatus | null | undefined,
  targetId: number,
): RecruitmentBlockReason | null {
  if (!status) return null;
  if (status.recruiterUsed >= status.recruiterCap)
    return 'RECRUITER_DAILY_CAP_REACHED';
  const target = status.targets[String(targetId)];
  if (!target) return null;
  if (target.targetUsed >= status.targetCap) return 'TARGET_DAILY_CAP_REACHED';
  if (target.pairUsed >= status.pairLimit) return 'PAIR_LIMIT_REACHED';
  return null;
}

/** Recruits left today with this player, bounded by every cap that applies. */
export function recruitsLeftFor(
  status: RecruitmentStatus | null | undefined,
  targetId: number,
): number | null {
  if (!status) return null;
  const target = status.targets[String(targetId)] ?? {
    pairUsed: 0,
    targetUsed: 0,
  };
  return Math.max(
    0,
    Math.min(
      status.pairLimit - target.pairUsed,
      status.targetCap - target.targetUsed,
      status.recruiterCap - status.recruiterUsed,
    ),
  );
}

/** Local clock reading of the daily reset, with the weekday when it is not today. */
export function formatResetTime(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const sameDay = reset.toDateString() === new Date().toDateString();
  return reset.toLocaleString(undefined, {
    ...(sameDay ? {} : { weekday: 'short' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

const BLOCK_MESSAGE_KEYS: Record<RecruitmentBlockReason, string> = {
  RECRUITER_DAILY_CAP_REACHED: 'recruit.blockedRecruiter',
  TARGET_DAILY_CAP_REACHED: 'recruit.blockedTarget',
  PAIR_LIMIT_REACHED: 'recruit.blockedPair',
};

/** Tooltip text for a disabled recruit button, or null when recruiting is open. */
export function recruitBlockMessage(
  t: (key: string, options: Record<string, unknown>) => string,
  status: RecruitmentStatus | null | undefined,
  targetId: number,
  targetName: string,
): string | null {
  const block = recruitmentBlockFor(status, targetId);
  if (!block || !status) return null;
  return t(BLOCK_MESSAGE_KEYS[block], {
    name: targetName,
    used: status.targets[String(targetId)]?.pairUsed ?? 0,
    limit:
      block === 'RECRUITER_DAILY_CAP_REACHED'
        ? status.recruiterCap
        : block === 'TARGET_DAILY_CAP_REACHED'
          ? status.targetCap
          : status.pairLimit,
    time: formatResetTime(status.resetsAt),
  });
}
