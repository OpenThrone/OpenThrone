import PlayerSupporterPanel from '@/components/admin/PlayerSupporterPanel';
import {
  EventTable,
  MembershipTable,
  SupporterOverview,
} from '@/components/admin/supporters/SupporterAdminParts';
import SupporterPriceTable from '@/components/admin/supporters/SupporterPriceTable';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import { SUPPORTER_PLANS } from '@/services/supporter/plans';
import type {
  AdminPlayerSupporter,
  PaymentEventRow,
  SupporterAdminSummary,
  SupporterMembershipRow,
} from '@/types/supporter';

const membership: SupporterMembershipRow = {
  userId: 1,
  displayName: 'Oakheart',
  status: 'ACTIVE',
  source: 'SUBSCRIPTION',
  activeUntil: '2099-01-01T00:00:00Z',
  cancelAtPeriodEnd: false,
  startedAt: '2026-01-01T00:00:00Z',
  totalPaidCents: 499,
  provider: 'mock',
  providerCustomerId: 'cus_mock',
  providerSubscriptionId: 'sub_mock',
};
const summary: SupporterAdminSummary = {
  activeSupporters: 42,
  pastDue: 2,
  mrrCents: 20958,
  revenueThisMonthCents: 25000,
  refundsThisMonthCents: 499,
  failedEvents: 1,
  activeSponsoredAlliances: 3,
  provider: 'mock',
  testMode: true,
};
const event: PaymentEventRow = {
  id: 1,
  provider: 'mock',
  providerEventId: 'evt_mock',
  type: 'payment.failed',
  status: 'FAILED',
  error: 'Example processing error',
  summary: { payment: 'example', userId: 1 },
  receivedAt: '2026-01-01T00:00:00Z',
  processedAt: null,
};
const player: AdminPlayerSupporter = {
  status: {
    isActive: true,
    tier: 'SUPPORTER',
    status: 'ACTIVE',
    source: 'SUBSCRIPTION',
    activeUntil: membership.activeUntil,
    cancelAtPeriodEnd: false,
    badgeVisible: true,
    canManageBilling: true,
    provider: 'mock',
  },
  membership,
  payments: [
    {
      id: 1,
      kind: 'SUBSCRIPTION',
      status: 'SUCCEEDED',
      amountCents: 499,
      refundedCents: 0,
      taxCents: 0,
      currency: 'usd',
      description: 'Monthly supporter',
      createdAt: '2026-01-01T00:00:00Z',
      allianceId: null,
      provider: 'mock',
    },
  ],
  gifts: [],
};
export default function SupporterAdminSection() {
  return (
    <ShowcaseSection
      id="supporter-admin"
      title="Supporter administration"
      description="Revenue and player membership controls with mock actions."
    >
      <Specimen
        name="Overview"
        usedOn={['/home/admin/supporters']}
        framed={false}
      >
        <SupporterOverview summary={summary} onEvents={mockAction('Events')} />
      </Specimen>
      <Specimen
        name="Plans & prices"
        usedOn={['/home/admin/supporters']}
        framed={false}
      >
        <SupporterPriceTable
          onPlayer={mockAction('Player editor')}
          plans={Object.values(SUPPORTER_PLANS).map((plan) => ({
            ...plan,
            updatedAt: null,
            updatedByName: null,
            updatedById: null,
          }))}
          onSave={mockAction('Save price')}
        />
      </Specimen>
      <Specimen name="Memberships" usedOn={['/home/admin/supporters']}>
        <MembershipTable
          rows={[membership]}
          onPlayer={mockAction('Player editor')}
        />
      </Specimen>
      <Specimen name="Webhook events" usedOn={['/home/admin/supporters']}>
        <EventTable
          rows={[event]}
          onPlayer={mockAction('Player editor')}
          onReplay={mockAction('Replay')}
          busyId={null}
        />
      </Specimen>
      <Specimen
        name="Player supporter panel"
        usedOn={['/home/admin']}
        framed={false}
      >
        <PlayerSupporterPanel
          userId={1}
          initialData={player}
          onAction={mockAction('Supporter action')}
        />
      </Specimen>
    </ShowcaseSection>
  );
}
