import {
  Badge,
  Button,
  Code,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { GameCard } from '@/components/game/GameCard';
import { date, money } from '@/components/supporter/SupporterParts';
import type {
  PaymentEventRow,
  SupporterAdminSummary,
  SupporterMembershipRow,
} from '@/types/supporter';

export function SupporterOverview({
  summary,
  onEvents,
}: {
  summary: SupporterAdminSummary;
  onEvents: () => void;
}) {
  const { t } = useTranslation('admin-supporters');
  const groups = [
    {
      title: 'members',
      items: [
        ['active', summary.activeSupporters],
        ['pastDue', summary.pastDue],
        ['alliances', summary.activeSponsoredAlliances],
      ],
    },
    {
      title: 'revenueGroup',
      items: [
        ['mrr', money(summary.mrrCents)],
        ['revenue', money(summary.revenueThisMonthCents)],
        ['refunds', money(summary.refundsThisMonthCents)],
      ],
    },
  ] as const;
  return (
    <GameCard title={t('overview')}>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        {groups.map((group) => (
          <Stack key={group.title} gap="xs">
            <Text fw={600}>{t(group.title)}</Text>
            <Divider />
            <Group align="stretch" gap="md">
              {group.items.map(([key, value]) => (
                <Stack
                  key={key}
                  gap={2}
                  style={{
                    flex: '1 1 90px',
                    borderInlineStart: '1px solid var(--ot-border)',
                    paddingInlineStart: 'var(--mantine-spacing-sm)',
                  }}
                >
                  <Text size="sm">{t(key)}</Text>
                  <Text
                    size="lg"
                    fw={600}
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {value}
                  </Text>
                </Stack>
              ))}
            </Group>
          </Stack>
        ))}
        <Stack gap="xs">
          <Text fw={600}>{t('health')}</Text>
          <Divider />
          <Text size="sm">{t('failedEvents')}</Text>
          <UnstyledButton
            onClick={onEvents}
            aria-label={t('viewFailedEvents', { count: summary.failedEvents })}
            style={{
              fontFamily: 'Inter, sans-serif',
              fontVariantNumeric: 'tabular-nums',
              textDecoration: 'underline',
              alignSelf: 'flex-start',
              color: summary.failedEvents
                ? 'var(--mantine-color-red-text)'
                : 'var(--ot-text)',
            }}
          >
            {summary.failedEvents}
          </UnstyledButton>
          <Group gap="xs">
            <Text size="sm">
              {t('provider')}: {summary.provider}
            </Text>
            {(summary.testMode ?? summary.provider === 'mock') && (
              <Badge color="yellow">{t('testMode')}</Badge>
            )}
          </Group>
        </Stack>
      </SimpleGrid>
    </GameCard>
  );
}

export function PlayerButton({
  userId,
  name,
  onPlayer,
}: {
  userId: number;
  name: string;
  onPlayer?: (id: number) => void;
}) {
  if (!onPlayer) return <>{name}</>;
  return (
    <UnstyledButton
      onClick={() => onPlayer(userId)}
      style={{
        color: 'var(--ot-text)',
        textDecoration: 'underline',
        textUnderlineOffset: '3px',
      }}
    >
      {name}
    </UnstyledButton>
  );
}

export function MembershipTable({
  rows,
  onPlayer,
}: {
  rows: SupporterMembershipRow[];
  onPlayer?: (id: number) => void;
}) {
  const { t } = useTranslation('admin-supporters');
  return (
    <AdminDataTable ariaLabel={t('memberships')}>
      <Table.Thead>
        <Table.Tr>
          {['player', 'status', 'source', 'activeUntil', 'totalPaid'].map(
            (k) => (
              <Table.Th key={k}>{t(k)}</Table.Th>
            ),
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.userId}>
            <Table.Td>
              <PlayerButton
                userId={row.userId}
                name={row.displayName}
                onPlayer={onPlayer}
              />
            </Table.Td>
            <Table.Td>
              <Badge
                color={
                  row.status === 'ACTIVE'
                    ? 'green'
                    : row.status === 'PAST_DUE'
                      ? 'yellow'
                      : 'gray'
                }
              >
                {t(`labels.${row.status}`)}
              </Badge>
            </Table.Td>
            <Table.Td>{t(`labels.${row.source}`)}</Table.Td>
            <Table.Td>{date(row.activeUntil)}</Table.Td>
            <Table.Td>{money(row.totalPaidCents)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </AdminDataTable>
  );
}

export function EventTable({
  rows,
  onReplay,
  onPlayer,
  busyId,
}: {
  rows: PaymentEventRow[];
  onReplay: (id: number) => void;
  onPlayer?: (id: number) => void;
  busyId: number | null;
}) {
  const { t } = useTranslation('admin-supporters');
  return (
    <AdminDataTable ariaLabel={t('events')}>
      <Table.Thead>
        <Table.Tr>
          {['date', 'type', 'status', 'details', 'actions'].map((k) => (
            <Table.Th key={k}>{t(k)}</Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.id}>
            <Table.Td>{date(row.receivedAt)}</Table.Td>
            <Table.Td>
              {row.type}
              <Text size="xs">{row.providerEventId}</Text>
            </Table.Td>
            <Table.Td>
              <Badge
                color={
                  row.status === 'FAILED'
                    ? 'red'
                    : row.status === 'PROCESSED'
                      ? 'green'
                      : 'gray'
                }
              >
                {t(`labels.${row.status}`)}
              </Badge>
            </Table.Td>
            <Table.Td>
              {Number.isSafeInteger(Number(row.summary.userId)) &&
                Number(row.summary.userId) > 0 && (
                  <PlayerButton
                    userId={Number(row.summary.userId)}
                    name={t('playerReference', { id: row.summary.userId })}
                    onPlayer={onPlayer}
                  />
                )}
              {row.error && <Text c="red">{row.error}</Text>}
              <details>
                <summary>{t('summary')}</summary>
                <Code block>{JSON.stringify(row.summary, null, 2)}</Code>
              </details>
            </Table.Td>
            <Table.Td>
              {row.status === 'FAILED' && (
                <Button
                  size="xs"
                  loading={busyId === row.id}
                  disabled={busyId !== null}
                  onClick={() => onReplay(row.id)}
                >
                  {t('replay')}
                </Button>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </AdminDataTable>
  );
}

export function StripePaymentLink({
  payment,
  testMode,
}: {
  payment: import('@/types/supporter').PaymentRecord;
  testMode: boolean;
}) {
  const id = payment.providerPaymentId;
  if (
    payment.provider !== 'stripe' ||
    !id ||
    !/^(pi|in)_[a-zA-Z0-9_]+$/.test(id)
  )
    return null;
  const kind = id.startsWith('pi_') ? 'payments' : 'invoices';
  return (
    <Text size="xs">
      <a
        href={`https://dashboard.stripe.com/${testMode ? 'test/' : ''}${kind}/${id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {id}
      </a>
    </Text>
  );
}
