export const INVESTIGATION_TYPES = [
  'ACCOUNT_FEEDING',
  'TRANSFER_RING',
  'ATTACK_FARMING',
  'COMBAT_ACCOUNTING',
  'RECRUITMENT_CONCENTRATION',
  'ALLIANCE_TREASURY',
  'SOCIAL_BURST',
] as const;
export type InvestigationType = (typeof INVESTIGATION_TYPES)[number];
export interface InvestigationFinding {
  key: string;
  type: InvestigationType;
  players: { id: number; name: string }[];
  count: number;
  firstSeen: string;
  lastSeen: string;
  metrics: Record<string, string | number | boolean>;
  evidence: {
    kind: string;
    id: number;
    at?: string;
    from?: number;
    to?: number;
    gold?: string;
  }[];
}
export interface InvestigationReport {
  since: string;
  until: string;
  findings: InvestigationFinding[];
  limitedTypes: InvestigationType[];
  snapshotCoverage: {
    scanned: number;
    eligible: number;
    missing: number;
    malformed: number;
    capped: boolean;
  };
}
