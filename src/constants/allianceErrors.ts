/**
 * Alliance refusals that carry a stable `code` and numeric `params` next to the
 * English message. The API returns all three; the browser translates
 * `alliances:errors.<code>` (src/utils/allianceErrorMessage.ts) and falls back
 * to the English message for any code without a translation. Client-safe.
 */
export type AllianceErrorParams = Record<string, string | number>;

export interface AllianceRefusal {
  code: string;
  message: string;
  params?: AllianceErrorParams;
}

/** Business refusal; the message is safe to show and english only. */
export class AllianceRuleError extends Error implements AllianceRefusal {
  readonly code: string;

  readonly params: AllianceErrorParams;

  constructor(code: string, message: string, params: AllianceErrorParams = {}) {
    super(message);
    this.name = 'AllianceRuleError';
    this.code = code;
    this.params = params;
  }
}

/** Codes for the refusals shared by the upgrade, dues and fee flows. */
export const ALLIANCE_RULE_CODES = {
  notMember: 'ALLIANCE_NOT_MEMBER',
  notFound: 'ALLIANCE_NOT_FOUND',
  upgradeForbidden: 'ALLIANCE_UPGRADE_FORBIDDEN',
  upgradeMaxed: 'ALLIANCE_UPGRADE_MAXED',
  upgradeStale: 'ALLIANCE_UPGRADE_STALE',
  upgradeMembers: 'ALLIANCE_UPGRADE_MEMBERS',
  upgradeFunds: 'ALLIANCE_UPGRADE_FUNDS',
  duesForbidden: 'ALLIANCE_DUES_FORBIDDEN',
  duesNoneOwed: 'ALLIANCE_DUES_NONE_OWED',
  duesNeedGold: 'ALLIANCE_DUES_NEED_GOLD',
  duesChanged: 'ALLIANCE_DUES_CHANGED',
  feeUnpaidSelf: 'ALLIANCE_JOIN_FEE_UNPAID_SELF',
  feeUnpaidApplicant: 'ALLIANCE_JOIN_FEE_UNPAID_APPLICANT',
  feeChanged: 'ALLIANCE_JOIN_FEE_CHANGED',
  settingsNegative: 'ALLIANCE_DUES_NEGATIVE',
  settingsFeeMax: 'ALLIANCE_DUES_FEE_MAX',
  settingsNeedPeriod: 'ALLIANCE_DUES_NEED_PERIOD',
  settingsNeedAmount: 'ALLIANCE_DUES_NEED_AMOUNT',
  settingsAmountMax: 'ALLIANCE_DUES_AMOUNT_MAX',
  callDuplicate: 'ALLIANCE_CALL_DUPLICATE',
} as const;
