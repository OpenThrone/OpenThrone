import type { ModerationRecommendedAction } from './chatModerationQuestions';

/**
 * What OUR policy would do. Shadow mode only records it; nothing is hidden,
 * deleted or banned, and no policy output ever bans an account.
 */
export const MODERATION_POLICY_ACTIONS = [
  'allow',
  'flag',
  'would_block',
] as const;
export type ModerationPolicyAction = (typeof MODERATION_POLICY_ACTIONS)[number];

export interface ModerationPolicyThresholds {
  /** Spam probability at or above which a message would be blocked. */
  spamBlock: number;
  /** Spam probability at or above which a message is flagged. */
  spamFlag: number;
  /** Harassment probability + severity needed to block outright. */
  harassmentBlock: number;
  severityBlock: number;
  /** Ambiguous harassment goes to a human. */
  harassmentFlag: number;
  severityFlag: number;
}

export const DEFAULT_MODERATION_THRESHOLDS: ModerationPolicyThresholds = {
  spamBlock: 0.9,
  spamFlag: 0.6,
  harassmentBlock: 0.9,
  severityBlock: 2.5,
  harassmentFlag: 0.5,
  severityFlag: 1.5,
};

export interface ModerationSignals {
  harassment: number;
  severity: number;
  spam: number;
  recommended: ModerationRecommendedAction;
}

/**
 * Maps model answers to our policy. The model's own recommendation can only
 * raise `allow` to `flag` (a human looks); it can never trigger `would_block`
 * by itself, so blocking always rests on our thresholds.
 */
export function decideModerationPolicy(
  signals: ModerationSignals,
  thresholds: ModerationPolicyThresholds = DEFAULT_MODERATION_THRESHOLDS,
): ModerationPolicyAction {
  const { harassment, severity, spam, recommended } = signals;
  if (spam >= thresholds.spamBlock) return 'would_block';
  if (
    harassment >= thresholds.harassmentBlock &&
    severity >= thresholds.severityBlock
  )
    return 'would_block';
  if (
    harassment >= thresholds.harassmentFlag ||
    severity >= thresholds.severityFlag ||
    spam >= thresholds.spamFlag ||
    recommended !== 'allow'
  )
    return 'flag';
  return 'allow';
}
