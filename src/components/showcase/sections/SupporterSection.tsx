import { Group, Select, Stack, Text } from '@mantine/core';

import {
  PremiumAllianceMark,
  SupporterBadge,
} from '@/components/player/SupporterBadge';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import { AllianceSponsorshipView } from '@/components/supporter/AllianceSponsorshipPanel';
import { CheckoutNoticeView } from '@/components/supporter/CheckoutNotice';
import { DiscordLinkView } from '@/components/supporter/DiscordLinkCard';
import { SupporterNoticeView } from '@/components/supporter/SupporterNotice';
import {
  Benefits,
  GiftReveal,
  PatronageCard,
  PatronageRecords,
  PlanCards,
  RedeemForm,
} from '@/components/supporter/SupporterParts';
import type {
  SupporterHistoryResponse,
  SupporterPlan,
  SupporterStatus,
} from '@/types/supporter';

const status: SupporterStatus = {
  isActive: true,
  tier: 'SUPPORTER',
  status: 'ACTIVE',
  source: 'SUBSCRIPTION',
  activeUntil: '2099-01-01T00:00:00Z',
  cancelAtPeriodEnd: false,
  badgeVisible: true,
  canManageBilling: true,
  provider: 'mock',
};
const plans: SupporterPlan[] = [
  {
    id: 'supporter_monthly',
    kind: 'SUBSCRIPTION',
    priceCents: 499,
    currency: 'usd',
    interval: 'month',
    grantMonths: null,
    grantDays: null,
  },
  {
    id: 'supporter_era_pass',
    kind: 'ONE_TIME',
    priceCents: 1299,
    currency: 'usd',
    interval: null,
    grantMonths: null,
    grantDays: 100,
  },
  ...([1, 3, 12] as const).map(
    (months): SupporterPlan => ({
      id: `gift_${months}m`,
      kind: 'GIFT',
      priceCents: months === 1 ? 499 : months === 3 ? 1399 : 4999,
      currency: 'usd',
      interval: null,
      grantMonths: months,
      grantDays: null,
    }),
  ),
];
const history: SupporterHistoryResponse = {
  payments: [
    {
      id: 1,
      kind: 'SUBSCRIPTION',
      status: 'SUCCEEDED',
      amountCents: 499,
      refundedCents: 0,
      taxCents: 0,
      currency: 'usd',
      description: 'supporter_monthly',
      createdAt: '2026-10-01T00:00:00Z',
      allianceId: null,
      provider: 'mock',
    },
  ],
  gifts: [
    {
      id: 1,
      codePrefix: 'EXAMPLE',
      months: 3,
      status: 'UNREDEEMED',
      recipientName: 'Kingdom',
      redeemedByName: null,
      redeemedAt: null,
      expiresAt: null,
      createdAt: '2026-10-01T00:00:00Z',
    },
  ],
};
export default function SupporterSection() {
  return (
    <ShowcaseSection
      id="supporter"
      title="Patrons of the Realm"
      description="Patronage and payment surfaces with mock actions."
    >
      <Specimen
        name="Patron seals"
        usedOn={['/userprofile/[id]', '/battle/users']}
      >
        <Group>
          {(['xs', 'sm', 'md'] as const).map((size) => (
            <Text key={size}>
              Kingdom{' '}
              <SupporterBadge
                size={size}
                supporter={{
                  supporterUntil: status.activeUntil,
                  badgeVisible: true,
                }}
              />
            </Text>
          ))}
          <Text>
            Alliance <PremiumAllianceMark />
          </Text>
        </Group>
      </Specimen>
      <Specimen
        name="Patron placements"
        usedOn={[
          '/userprofile/[id]',
          '/battle/users',
          '/alliances/[id]',
          'chat',
          'sidebar',
        ]}
      >
        <Stack>
          {['Player row', 'Profile hero line', 'Chat line', 'Roster row'].map(
            (label) => (
              <Text key={label}>
                {label}: Kingdom{' '}
                <SupporterBadge
                  supporter={{ supporterUntil: status.activeUntil }}
                />
              </Text>
            ),
          )}
        </Stack>
      </Specimen>
      <Specimen
        name="Public patron benefits"
        usedOn={['/supporter']}
        framed={false}
      >
        <Benefits />
      </Specimen>
      <Specimen
        name="Patronage: status and perks"
        usedOn={['/home/supporter']}
        framed={false}
        wide
      >
        <Stack>
          {(['ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', null] as const).map(
            (state) => (
              <PatronageCard
                key={state ?? 'never'}
                status={{
                  ...status,
                  status: state,
                  isActive:
                    state === 'ACTIVE' ||
                    state === 'PAST_DUE' ||
                    state === 'CANCELED',
                  activeUntil: state ? status.activeUntil : null,
                  source: state ? status.source : null,
                  tier: state ? status.tier : null,
                  canManageBilling: !!state,
                  cancelAtPeriodEnd: state === 'CANCELED',
                }}
                onBilling={mockAction('Manage billing')}
                onBadgeChange={mockAction('Change badge visibility')}
                onAutoRecruit={mockAction('Open Auto-Recruit')}
              />
            ),
          )}
        </Stack>
      </Specimen>
      {(['self', 'gift'] as const).map((mode) => (
        <Specimen
          key={mode}
          name={`Patronage chooser: ${mode}`}
          usedOn={['/supporter', '/home/supporter']}
          framed={false}
          wide
        >
          <PlanCards
            plans={plans}
            defaultMode={mode}
            onChoose={mockAction('Continue to consent')}
            giftRecipient={
              <Select
                label="Gift recipient (optional)"
                description="Mock kingdom search"
                placeholder="Search kingdoms"
                searchable
                clearable
                data={['Kingdom', 'Moon Keep']}
              />
            }
            redeem={<RedeemForm onRedeem={mockAction('Redeem gift')} />}
          />
        </Specimen>
      ))}
      <Specimen
        name="Current subscription"
        usedOn={['/home/supporter']}
        framed={false}
      >
        <PlanCards
          plans={plans}
          currentPlanId="supporter_monthly"
          onChoose={mockAction('Continue to consent')}
        />
      </Specimen>
      <Specimen name="Sales off" usedOn={['/home/supporter']} framed={false}>
        <PlanCards
          plans={[]}
          onChoose={mockAction('Continue to consent')}
          redeem={<RedeemForm onRedeem={mockAction('Redeem gift')} />}
        />
      </Specimen>
      <Specimen
        name="Alliance sponsorship"
        usedOn={['/alliances/[id]']}
        framed={false}
      >
        <Stack>
          {[false, true].map((isPremium) => (
            <AllianceSponsorshipView
              key={String(isPremium)}
              info={{
                allianceId: 1,
                isPremium,
                poolCents: 2500,
                activeUntil: isPremium ? '2099-01-01T00:00:00Z' : null,
                contributors: [
                  { userId: 1, displayName: 'Kingdom', totalCents: 2500 },
                ],
              }}
              onContribute={mockAction('Contribute')}
            />
          ))}
        </Stack>
      </Specimen>
      <Specimen
        name="Checkout notices"
        usedOn={['/home/supporter', '/alliances/[id]']}
      >
        <Stack>
          {(
            [
              'confirming',
              'confirmed',
              'canceled',
              'pending',
              'subscribed',
              'signedOut',
              'error',
              'declined',
              'success',
            ] as const
          ).map((state) => (
            <CheckoutNoticeView
              key={state}
              state={state}
              onRetry={mockAction('Retry')}
              onSignIn={mockAction('Sign in to resume confirmation')}
            />
          ))}
        </Stack>
      </Specimen>
      <Specimen name="Patronage notices" usedOn={['in-game layout']}>
        <Stack>
          <SupporterNoticeView
            status={{ ...status, status: 'PAST_DUE' }}
            onPortal={mockAction('Update payment')}
          />
          <SupporterNoticeView
            status={{
              ...status,
              activeUntil: new Date(Date.now() + 86400000).toISOString(),
            }}
            onPortal={mockAction('Update payment')}
          />
        </Stack>
      </Specimen>
      <Specimen
        name="Discord linking"
        usedOn={['/home/settings']}
        framed={false}
      >
        <Stack>
          {(
            ['unlinked', 'code', 'linked', 'premiumAlliance', 'patron'] as const
          ).map((state) => (
            <DiscordLinkView
              key={state}
              info={{
                linked: ['linked', 'premiumAlliance', 'patron'].includes(state),
                allowedAlerts:
                  state === 'patron'
                    ? ['attacks', 'spyHits', 'wars', 'turnCap']
                    : state === 'premiumAlliance'
                      ? ['wars']
                      : [],
                discordUsername: 'Patron',
                linkedAt: '2026-01-01T00:00:00Z',
                notifyPrefs: {
                  dailyDigest: true,
                  attacks: false,
                  spyHits: false,
                  wars: false,
                  turnCap: false,
                  quietHoursStart: null,
                  quietHoursEnd: null,
                },
              }}
              code={
                state === 'code'
                  ? { code: 'EXAMPLE', expiresAt: '2099-01-01T00:00:00Z' }
                  : null
              }
              active={state === 'patron'}
              busy={false}
              error={false}
              onGenerate={mockAction('Generate code')}
              onUnlink={mockAction('Unlink')}
              onPrefs={mockAction('Save preferences')}
            />
          ))}
        </Stack>
      </Specimen>
      {(['payments', 'gifts'] as const).map((tab) => (
        <Specimen
          key={tab}
          name={`Records: ${tab}`}
          usedOn={['/home/supporter']}
          framed={false}
          wide
        >
          <PatronageRecords history={history} defaultTab={tab} />
        </Specimen>
      ))}
      <Specimen
        name="Empty records"
        usedOn={['/home/supporter']}
        framed={false}
      >
        <PatronageRecords history={{ payments: [], gifts: [] }} />
      </Specimen>
      <Specimen name="Gift reveal" usedOn={['/supporter/mock-checkout']}>
        <GiftReveal code="EXAMPLE-CODE" />
      </Specimen>
      <Specimen name="Redeem a gift" usedOn={['/home/supporter']}>
        <RedeemForm onRedeem={mockAction('Redeem gift')} />
      </Specimen>
    </ShowcaseSection>
  );
}
