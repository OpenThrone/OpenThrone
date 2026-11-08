import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  Group,
  List,
  Radio,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { SectionHeading } from '@/components/game/SectionHeading';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import classes from '@/components/supporter/Supporter.module.css';
import type {
  PaymentRecord,
  SupporterHistoryResponse,
  SupporterPlan,
  SupporterStatus,
} from '@/types/supporter';

export const money = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    cents / 100,
  );
export const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

function BenefitsList() {
  const { t } = useTranslation('supporter');
  return (
    <Stack gap="sm">
      <List spacing="xs" size="sm">
        {[
          ['badge', 'crown'],
          ['alerts', 'horn-call'],
          ['autoRecruit', 'cycle'],
          ['alliance', 'double-team'],
          ['gifts', 'gift-of-knowledge'],
        ].map(([key, icon]) => (
          <List.Item
            key={key}
            icon={
              <RpgAwesomeIcon
                icon={icon}
                color="var(--ot-accent)"
                fixedWidth
                aria-hidden
              />
            }
          >
            {t(`benefits.${key}`)}
          </List.Item>
        ))}
      </List>
      <Text size="sm" c="dimmed">
        {t('benefits.pledge')}
      </Text>
    </Stack>
  );
}

/** Public-page benefits; the player page seats this list beside their status. */
export function Benefits() {
  const { t } = useTranslation('supporter');
  return (
    <GameCard title={t('benefits.title')}>
      <BenefitsList />
    </GameCard>
  );
}

export function PatronageCard({
  status,
  busy = false,
  onBilling,
  onBadgeChange,
  onAutoRecruit,
}: {
  status: SupporterStatus;
  busy?: boolean;
  onBilling: () => void;
  onBadgeChange: (visible: boolean) => void;
  onAutoRecruit?: () => void;
}) {
  const { t } = useTranslation('supporter');
  return (
    <GameCard title={t('statusTitle')} goldAccent>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Stack gap="sm">
          <Text fw={700}>{t(`statuses.${status.status ?? 'NEVER'}`)}</Text>
          {!status.isActive && !status.activeUntil && (
            <Text size="sm" c="dimmed">
              {t('notPatronHint')}
            </Text>
          )}
          {status.activeUntil && (
            <Text>
              {t(status.isActive ? 'until' : 'ends', {
                date: date(status.activeUntil),
              })}
            </Text>
          )}
          {status.source && (
            <Text size="sm">
              {t('source', { source: t(`sources.${status.source}`) })}
            </Text>
          )}
          {status.isActive && status.source === 'SUBSCRIPTION' && (
            <Text size="sm" c="dimmed">
              {t(status.cancelAtPeriodEnd ? 'cancels' : 'renews')}
            </Text>
          )}
          {status.tier && (
            <Switch
              label={t('badge')}
              checked={status.badgeVisible}
              disabled={busy}
              onChange={(event) => onBadgeChange(event.currentTarget.checked)}
            />
          )}
          <Group gap="sm">
            {status.canManageBilling && (
              <Button variant="outline" disabled={busy} onClick={onBilling}>
                {t('billing')}
              </Button>
            )}
            {status.isActive &&
              (onAutoRecruit ? (
                <Button variant="outline" onClick={onAutoRecruit}>
                  {t('openAutoRecruit')}
                </Button>
              ) : (
                <Button component={Link} href="/auto-recruit" variant="outline">
                  {t('openAutoRecruit')}
                </Button>
              ))}
          </Group>
        </Stack>
        <Stack gap="sm">
          <SectionHeading>{t('benefits.title')}</SectionHeading>
          <BenefitsList />
        </Stack>
      </SimpleGrid>
    </GameCard>
  );
}

export function PlanCards({
  plans,
  onChoose,
  busy = false,
  loggedOut = false,
  giftRecipient,
  currentPlanId,
  defaultMode = 'self',
  redeem,
}: {
  plans: SupporterPlan[];
  onChoose: (plan: SupporterPlan) => void;
  busy?: boolean;
  loggedOut?: boolean;
  giftRecipient?: ReactNode;
  currentPlanId?: SupporterPlan['id'];
  defaultMode?: 'self' | 'gift';
  redeem?: ReactNode;
}) {
  const { t } = useTranslation('supporter');
  const [mode, setMode] = useState<string>(defaultMode);
  const [selection, setSelection] = useState({ self: '', gift: '' });
  const visiblePlans = plans.filter(
    (plan) => (plan.kind === 'GIFT') === (mode === 'gift'),
  );
  const selectablePlans = visiblePlans.filter(
    (plan) => plan.id !== currentPlanId,
  );
  const selected =
    selectablePlans.find((plan) => plan.id === selection[mode]) ??
    selectablePlans[0];
  const monthly = plans.find((plan) => plan.id === 'supporter_monthly');
  return (
    <GameCard title={t('chooser.title')}>
      <Stack gap="md">
        {plans.length ? (
          <>
            <SegmentedControl
              value={mode}
              onChange={setMode}
              disabled={busy}
              fullWidth
              aria-label={t('chooser.mode')}
              data={[
                { value: 'self', label: t('chooser.self') },
                { value: 'gift', label: t('chooser.gift') },
              ]}
            />
            {mode === 'gift' && giftRecipient}
            <Radio.Group
              value={selected?.id ?? ''}
              onChange={(value) =>
                setSelection((previous) => ({ ...previous, [mode]: value }))
              }
              aria-label={t(mode === 'gift' ? 'giftPlans' : 'patronPlans')}
            >
              <Stack gap={0}>
                {visiblePlans.map((plan) => {
                  const current = plan.id === currentPlanId;
                  const saving =
                    plan.grantMonths && monthly
                      ? monthly.priceCents * plan.grantMonths - plan.priceCents
                      : 0;
                  const content = (
                    <Box className={classes.planContent}>
                      <Group gap="sm" wrap="nowrap" align="flex-start">
                        {!current && <Radio.Indicator disabled={busy} mt={3} />}
                        <Stack gap={4} style={{ minWidth: 0 }}>
                          <Group gap="xs">
                            <Text fw={600}>
                              {t(
                                plan.kind === 'GIFT'
                                  ? `chooser.giftPlans.${plan.id}`
                                  : `plans.${plan.id}`,
                              )}
                            </Text>
                            {current ? (
                              <Badge variant="outline" size="sm">
                                {t('currentPlan')}
                              </Badge>
                            ) : (
                              plan.id === 'supporter_monthly' && (
                                <Badge variant="light" size="sm">
                                  {t('recommended')}
                                </Badge>
                              )
                            )}
                          </Group>
                          {/* Gift rows say "N months" in the title; the detail line carries value. */}
                          {(plan.kind !== 'GIFT' || saving <= 0) && (
                            <Text size="sm" c="dimmed">
                              {t(`planDetails.${plan.id}`)}
                            </Text>
                          )}
                          {plan.grantMonths && saving > 0 && (
                            <Text size="sm" c="dimmed">
                              {t('giftSavings', {
                                monthly: money(
                                  plan.priceCents / plan.grantMonths,
                                  plan.currency,
                                ),
                                savings: money(saving, plan.currency),
                              })}
                            </Text>
                          )}
                        </Stack>
                      </Group>
                      <Text fw={600} className={classes.price}>
                        {money(plan.priceCents, plan.currency)}
                        {plan.interval && ` / ${t('month')}`}
                      </Text>
                    </Box>
                  );
                  // The current plan is informational, outside the selectable radio set.
                  return current ? (
                    <Box key={plan.id} className={classes.planRow}>
                      {content}
                    </Box>
                  ) : (
                    <Radio.Card
                      key={plan.id}
                      value={plan.id}
                      className={classes.planRow}
                      withBorder={false}
                      disabled={busy}
                    >
                      {content}
                    </Radio.Card>
                  );
                })}
              </Stack>
            </Radio.Group>
            {!visiblePlans.length && <Text c="dimmed">{t('comingSoon')}</Text>}
            {loggedOut ? (
              <Button
                component={Link}
                href="/account/login"
                disabled={!selected}
              >
                {t('loginToSupport')}
              </Button>
            ) : (
              <Button
                loading={busy}
                disabled={!selected}
                onClick={() => selected && onChoose(selected)}
              >
                {t(mode === 'gift' ? 'chooser.buyGift' : 'consent.continue')}
              </Button>
            )}
          </>
        ) : (
          <Text>{t('comingSoon')}</Text>
        )}
        {redeem && (
          <>
            <Divider />
            <SectionHeading>{t('redeemTitle')}</SectionHeading>
            {redeem}
          </>
        )}
      </Stack>
    </GameCard>
  );
}

function PaymentHistory({ payments }: { payments: PaymentRecord[] }) {
  const { t } = useTranslation('supporter');
  if (!payments.length) return <Text c="dimmed">{t('noPayments')}</Text>;
  return (
    <Table.ScrollContainer minWidth={480}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('date')}</Table.Th>
            <Table.Th>{t('description')}</Table.Th>
            <Table.Th ta="right">{t('amount')}</Table.Th>
            <Table.Th>{t('status')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {payments.map((payment) => (
            <Table.Tr key={payment.id}>
              <Table.Td>{date(payment.createdAt)}</Table.Td>
              <Table.Td>
                {t(`plans.${payment.description}`, {
                  defaultValue: t(`kinds.${payment.kind}`),
                })}
              </Table.Td>
              <Table.Td className={classes.price}>
                {money(payment.amountCents, payment.currency)}
              </Table.Td>
              <Table.Td>{t(`paymentStatuses.${payment.status}`)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function PatronageRecords({
  history,
  defaultTab = 'payments',
}: {
  history: SupporterHistoryResponse;
  defaultTab?: 'payments' | 'gifts';
}) {
  const { t } = useTranslation('supporter');
  return (
    <GameCard title={t('records')} goldAccent={false}>
      <Tabs defaultValue={defaultTab}>
        <Tabs.List>
          <Tabs.Tab value="payments">{t('paymentsTab')}</Tabs.Tab>
          <Tabs.Tab value="gifts">{t('giftsBought')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="payments" pt="md">
          <PaymentHistory payments={history.payments} />
        </Tabs.Panel>
        <Tabs.Panel value="gifts" pt="md">
          {history.gifts.length ? (
            <Table.ScrollContainer minWidth={360}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('giftCode')}</Table.Th>
                    <Table.Th>{t('status')}</Table.Th>
                    <Table.Th>{t('date')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {history.gifts.map((gift) => (
                    <Table.Tr key={gift.id}>
                      <Table.Td>{gift.codePrefix}…</Table.Td>
                      <Table.Td>{t(`giftStatuses.${gift.status}`)}</Table.Td>
                      <Table.Td>{date(gift.createdAt)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Text c="dimmed">{t('noGifts')}</Text>
          )}
        </Tabs.Panel>
      </Tabs>
    </GameCard>
  );
}

export function RedeemForm({
  onRedeem,
  busy = false,
}: {
  onRedeem: (code: string) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation('supporter');
  const [code, setCode] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && code.trim()) onRedeem(code.trim());
      }}
    >
      <Flex gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label={t('giftCode')}
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          required
          disabled={busy}
          style={{ flex: '1 1 16rem' }}
        />
        <Button type="submit" loading={busy} disabled={!code.trim()}>
          {t('redeem')}
        </Button>
      </Flex>
    </form>
  );
}

export function GiftReveal({ code }: { code: string }) {
  const { t } = useTranslation('supporter');
  const [copied, setCopied] = useState(false);
  return (
    <Alert title={t('giftCode')} color="yellow">
      <Text>{t('giftWarning')}</Text>
      <Group>
        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
          {code}
        </Text>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? t('copied') : t('copy')}
        </Button>
      </Group>
    </Alert>
  );
}
