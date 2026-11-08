import type { SupporterStatus } from '@/types/supporter';

/**
 * Whether the menu lists Patronage. While sales are off it stays only for
 * players with a subscription that will still charge them, so they can
 * cancel or fix their card; the page itself remains reachable by URL.
 */
export function showPatronageLink(
  salesEnabled: boolean,
  status: SupporterStatus | null | undefined,
): boolean {
  if (salesEnabled) return true;
  return (
    !!status?.canManageBilling &&
    status.source === 'SUBSCRIPTION' &&
    (status.status === 'ACTIVE' || status.status === 'PAST_DUE') &&
    !status.cancelAtPeriodEnd
  );
}
