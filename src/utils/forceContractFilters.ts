/**
 * Contracts that may count toward a roster: mercenary contracts, and alliance
 * contracts only while the lending alliance is ACTIVE. A RESERVED alliance (#13)
 * grants no forces, however it got reserved (rollover or admin override).
 */
export const CONTRACT_OWNER_ACTIVE = {
  OR: [{ allianceId: null }, { alliance: { status: 'ACTIVE' as const } }],
};
