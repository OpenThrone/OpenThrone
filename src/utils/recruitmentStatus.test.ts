import { describe, expect, it } from 'bun:test';

import {
  recruitBlockMessage,
  recruitmentBlockFor,
  type RecruitmentStatus,
  recruitsLeftFor,
  shouldSubmitRecruitAgain,
} from './recruitmentStatus';

const status = (
  overrides: Partial<RecruitmentStatus> = {},
): RecruitmentStatus => ({
  pairLimit: 5,
  recruiterCap: 25,
  targetCap: 25,
  recruiterUsed: 3,
  resetsAt: '2026-10-18T04:00:00.000Z',
  targets: { '42': { pairUsed: 2, targetUsed: 4 } },
  ...overrides,
});

describe('recruitmentBlockFor', () => {
  it('is open until a limit is reached', () => {
    expect(recruitmentBlockFor(null, 42)).toBeNull();
    expect(recruitmentBlockFor(status(), 42)).toBeNull();
    expect(recruitmentBlockFor(status(), 99)).toBeNull();
  });

  it('blocks at the pair, target and recruiter limits, recruiter first', () => {
    const pair = status({ targets: { '42': { pairUsed: 5, targetUsed: 5 } } });
    expect(recruitmentBlockFor(pair, 42)).toBe('PAIR_LIMIT_REACHED');
    const target = status({
      targets: { '42': { pairUsed: 1, targetUsed: 25 } },
    });
    expect(recruitmentBlockFor(target, 42)).toBe('TARGET_DAILY_CAP_REACHED');
    const recruiter = status({
      recruiterUsed: 25,
      targets: { '42': { pairUsed: 5, targetUsed: 25 } },
    });
    expect(recruitmentBlockFor(recruiter, 42)).toBe(
      'RECRUITER_DAILY_CAP_REACHED',
    );
  });
});

describe('recruitsLeftFor', () => {
  it('is bounded by the tightest limit', () => {
    expect(recruitsLeftFor(status(), 42)).toBe(3);
    expect(recruitsLeftFor(status({ recruiterUsed: 24 }), 42)).toBe(1);
    expect(recruitsLeftFor(status(), 99)).toBe(5);
    expect(recruitsLeftFor(null, 42)).toBeNull();
  });
});

describe('recruitBlockMessage', () => {
  const t = (key: string, options: Record<string, unknown>) =>
    `${key}|${options.used}/${options.limit}|${options.name}`;

  it('explains the pair limit and stays null when open', () => {
    const blocked = status({
      targets: { '42': { pairUsed: 5, targetUsed: 5 } },
    });
    expect(recruitBlockMessage(t, blocked, 42, 'Tyler')).toBe(
      'recruit.blockedPair|5/5|Tyler',
    );
    expect(recruitBlockMessage(t, status(), 42, 'Tyler')).toBeNull();
  });
});

describe('shouldSubmitRecruitAgain (playtest #339)', () => {
  const ready = {
    pending: true,
    ready: true,
    showCaptcha: false,
    succeeded: false,
    error: null,
    submitting: false,
  };

  it('recruits once the re-check shows the form', () => {
    expect(shouldSubmitRecruitAgain(ready)).toBe(true);
  });

  it('waits while the re-check is still running', () => {
    expect(shouldSubmitRecruitAgain({ ...ready, ready: false })).toBe(false);
    expect(shouldSubmitRecruitAgain({ ...ready, succeeded: true })).toBe(false);
  });

  it('leaves captchas, refusals and plain retries to the player', () => {
    expect(shouldSubmitRecruitAgain({ ...ready, showCaptcha: true })).toBe(
      false,
    );
    expect(shouldSubmitRecruitAgain({ ...ready, error: 'cap' })).toBe(false);
    expect(shouldSubmitRecruitAgain({ ...ready, pending: false })).toBe(false);
    expect(shouldSubmitRecruitAgain({ ...ready, submitting: true })).toBe(
      false,
    );
  });
});
