import { describe, expect, test } from 'bun:test';

import {
  completionReasonKey,
  pickRecruitTarget,
  recruitmentOutcome,
} from '@/utils/autoRecruitFlow';

describe('auto recruit flow', () => {
  const targets = [
    { user: { id: 1 }, remainingRecruits: 2 },
    { user: { id: 2 }, remainingRecruits: 1 },
    { user: { id: 3 }, remainingRecruits: 0 },
  ];

  test('selects eligible alternatives uniformly and falls back to the previous target', () => {
    expect(pickRecruitTarget(targets, 1, () => 0)?.user.id).toBe(2);
    expect(pickRecruitTarget(targets, undefined, () => 0.999)?.user.id).toBe(2);
    expect(pickRecruitTarget([targets[0], targets[2]], 1)?.user.id).toBe(1);
    expect(pickRecruitTarget([targets[2]])).toBeUndefined();
  });

  test('advances after success and skips pair and target refusals', () => {
    expect(recruitmentOutcome('SUCCESS')).toBe('advance');
    expect(recruitmentOutcome('PAIR_LIMIT_REACHED')).toBe('skip');
    expect(recruitmentOutcome('TARGET_DAILY_CAP_REACHED')).toBe('skip');
    expect(recruitmentOutcome('RECRUITER_DAILY_CAP_REACHED')).toBe('complete');
    expect(recruitmentOutcome('NO_RECRUITABLE_USERS_FOUND')).toBe('complete');
    expect(recruitmentOutcome('CAPTCHA_FAILED')).toBe('error');
  });
});

describe('auto recruit completion reason', () => {
  test('tells a capped recruiter about the daily limit, otherwise that everyone is done', () => {
    expect(completionReasonKey('RECRUITER_DAILY_CAP_REACHED')).toBe(
      'autoRecruit.dailyCapReached',
    );
    expect(completionReasonKey('NO_RECRUITABLE_USERS_FOUND')).toBe(
      'autoRecruit.doneForToday',
    );
    expect(completionReasonKey()).toBe('autoRecruit.doneForToday');
  });
});
