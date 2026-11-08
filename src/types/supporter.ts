/**
 * Shared contract for supporter memberships, payments and Discord linking.
 * API routes return these shapes; UI renders them. Amounts are integer cents.
 * No card data exists anywhere in this contract (see
 * docs/features/supporter-memberships.md).
 */

export type SupporterTier = 'SUPPORTER';

export type MembershipStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export type MembershipSource = 'SUBSCRIPTION' | 'ONE_TIME' | 'GIFT' | 'COMP';

export type PaymentProviderName = 'mock' | 'stripe';

export type PaymentKind =
  | 'SUBSCRIPTION'
  | 'ONE_TIME'
  | 'GIFT'
  | 'ALLIANCE_SPONSORSHIP';

export type PaymentStatus =
  | 'SUCCEEDED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED'
  | 'FAILED';

export type PaymentEventStatus =
  | 'RECEIVED'
  | 'PROCESSED'
  | 'FAILED'
  | 'IGNORED';

/** Purchasable products; prices mirror provider config for display. */
export type SupporterPlanId =
  | 'supporter_monthly'
  | 'supporter_era_pass'
  | 'gift_1m'
  | 'gift_3m'
  | 'gift_12m';

export interface SupporterPlan {
  id: SupporterPlanId;
  kind: Exclude<PaymentKind, 'ALLIANCE_SPONSORSHIP'>;
  priceCents: number;
  currency: 'usd';
  /** Subscription billing interval, or null for one-time products. */
  interval: 'month' | null;
  /** Months granted (gifts) or days granted (era pass); null for subscriptions. */
  grantMonths: number | null;
  grantDays: number | null;
}

/** GET /api/supporter/status (current user). */
export interface SupporterStatus {
  isActive: boolean;
  tier: SupporterTier | null;
  status: MembershipStatus | null;
  source: MembershipSource | null;
  /** ISO timestamp perks run until, or null if never a supporter. */
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
  badgeVisible: boolean;
  /** True when the player can open the provider's billing portal. */
  canManageBilling: boolean;
  provider: PaymentProviderName | null;
}

/** Minimal badge data embedded in player lists and profiles. */
export interface SupporterBadgeInfo {
  /** ISO timestamp from users.supporter_until; badge shows while in future. */
  supporterUntil: string | null;
  badgeVisible: boolean;
}

export interface PaymentRecord {
  id: number;
  kind: PaymentKind;
  status: PaymentStatus;
  amountCents: number;
  refundedCents: number;
  taxCents: number;
  currency: string;
  description: string;
  createdAt: string;
  allianceId: number | null;
  provider: PaymentProviderName;
  /** Admin responses only: provider payment ID for dashboard links. */
  providerPaymentId?: string;
  /** Billing address country (sales are US-only; others need review). */
  billingCountry?: string | null;
}

export interface GiftCodeRecord {
  id: number;
  codePrefix: string;
  months: number;
  status: 'UNREDEEMED' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';
  recipientName: string | null;
  redeemedByName: string | null;
  redeemedAt: string | null;
  /** Null: never expires. */
  expiresAt: string | null;
  createdAt: string;
}

/** GET /api/supporter/payments (current user). */
export interface SupporterHistoryResponse {
  payments: PaymentRecord[];
  gifts: GiftCodeRecord[];
}

/** POST /api/supporter/checkout body. */
export interface CheckoutRequest {
  planId: SupporterPlanId | 'alliance_sponsorship';
  /** Price displayed at consent; a stale quote requires renewed consent. */
  quotedPriceCents?: number;
  /** Alliance sponsorship only: amount in cents, minimum 500. */
  amountCents?: number;
  allianceId?: number;
  /** Gifts only: optional recipient kingdom ID to notify. */
  recipientUserId?: number;
  /** Required by the checkout API: the buyer ticked the consent box. */
  consent?: { accepted: true; version: string; locale: string };
}

/** POST /api/supporter/checkout response: redirect the browser to `url`. */
export interface CheckoutResponse {
  url: string;
  /** Provider checkout session, linked to the stored consent. */
  sessionId?: string;
}

/** POST /api/supporter/redeem body / response. */
export interface RedeemGiftRequest {
  code: string;
}
export interface RedeemGiftResponse {
  status: SupporterStatus;
  monthsAdded: number;
}

/** GET /api/alliances/[id]/sponsorship. */
export interface AllianceSponsorshipInfo {
  allianceId: number;
  isPremium: boolean;
  poolCents: number;
  activeUntil: string | null;
  contributors: { userId: number; displayName: string; totalCents: number }[];
}

/** GET /api/account/discord. */
export interface DiscordLinkInfo {
  linked: boolean;
  discordUsername: string | null;
  linkedAt: string | null;
  notifyPrefs: DiscordNotifyPrefs;
  /** Instant alerts this player may turn on: all four for supporters, war alerts for premium alliance members. */
  allowedAlerts: ('attacks' | 'spyHits' | 'wars' | 'turnCap')[];
}

export interface DiscordNotifyPrefs {
  dailyDigest: boolean;
  /** Instant alerts (see DiscordLinkInfo.allowedAlerts). */
  attacks: boolean;
  spyHits: boolean;
  wars: boolean;
  turnCap: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

/** POST /api/account/discord/link-code response; code shown once. */
export interface DiscordLinkCodeResponse {
  code: string;
  expiresAt: string;
}

/** Admin: GET /api/admin/supporters/summary. */
export interface SupporterAdminSummary {
  activeSupporters: number;
  pastDue: number;
  mrrCents: number;
  revenueThisMonthCents: number;
  refundsThisMonthCents: number;
  failedEvents: number;
  activeSponsoredAlliances: number;
  provider: PaymentProviderName;
  /** True when the provider key is a test/sandbox key. */
  testMode: boolean;
}

/** Admin: one row of GET /api/admin/supporters/memberships. */
export interface SupporterMembershipRow {
  userId: number;
  displayName: string;
  status: MembershipStatus;
  source: MembershipSource;
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
  startedAt: string;
  totalPaidCents: number;
  provider: PaymentProviderName;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

/** Admin: one row of GET /api/admin/supporters/events. */
export interface PaymentEventRow {
  id: number;
  provider: PaymentProviderName;
  providerEventId: string;
  type: string;
  status: PaymentEventStatus;
  error: string | null;
  summary: Record<string, string | number | boolean | null>;
  receivedAt: string;
  processedAt: string | null;
}

/** Admin: Edit Player supporter panel, GET/PATCH /api/admin/users/[userId]/supporter. */
export interface AdminPlayerSupporter {
  status: SupporterStatus;
  membership: SupporterMembershipRow | null;
  payments: PaymentRecord[];
  gifts: GiftCodeRecord[];
  /** Absent in older fixtures; null when the player has not linked Discord. */
  discord?: AdminDiscordLink | null;
  /** What the player agreed to before each checkout, newest first. */
  consents?: AdminPurchaseConsent[];
}

export interface AdminPurchaseConsent {
  id: number;
  planId: string;
  amountCents: number;
  locale: string;
  version: string;
  text: string;
  checkoutSessionId: string | null;
  acceptedAt: string;
}

export interface AdminDiscordLink {
  discordUserId: string;
  discordUsername: string;
  linkedAt: string;
  notifyPrefs: DiscordNotifyPrefs;
  /** Queued DMs by status (PENDING, SENT, SKIPPED, FAILED) over two weeks. */
  outbox: Record<string, number>;
}

export type AdminSupporterAction =
  | { action: 'comp'; days: number; reason: string }
  | { action: 'revoke'; reason: string }
  | {
      action: 'refund';
      paymentId: number;
      amountCents?: number;
      reason: string;
      cancelSubscription?: boolean;
    }
  | { action: 'setBadgeVisible'; badgeVisible: boolean }
  | { action: 'unlinkDiscord'; reason: string };

export interface AdminSupporterPlan extends SupporterPlan {
  updatedById: number | null;
  updatedAt: string | null;
  updatedByName: string | null;
}
