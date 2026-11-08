/** Choose uniformly among eligible targets, avoiding the previous one if possible. */
export function pickRecruitTarget<
  T extends { user: { id: number }; remainingRecruits: number },
>(
  targets: T[],
  excludeUserId?: number,
  random: () => number = Math.random,
): T | undefined {
  const eligible = targets.filter((target) => target.remainingRecruits > 0);
  const alternatives = eligible.filter(
    (target) => target.user.id !== excludeUserId,
  );
  const candidates = alternatives.length ? alternatives : eligible;
  return candidates[Math.floor(random() * candidates.length)];
}

export function recruitmentOutcome(
  code?: string,
): 'advance' | 'skip' | 'complete' | 'error' {
  if (code === 'SUCCESS') return 'advance';
  if (code === 'PAIR_LIMIT_REACHED' || code === 'TARGET_DAILY_CAP_REACHED')
    return 'skip';
  if (
    code === 'RECRUITER_DAILY_CAP_REACHED' ||
    code === 'NO_RECRUITABLE_USERS_FOUND'
  )
    return 'complete';
  return 'error';
}

/** Translation key explaining why a session ended on its own. */
export function completionReasonKey(code?: string): string {
  return code === 'RECRUITER_DAILY_CAP_REACHED'
    ? 'autoRecruit.dailyCapReached'
    : 'autoRecruit.doneForToday';
}
