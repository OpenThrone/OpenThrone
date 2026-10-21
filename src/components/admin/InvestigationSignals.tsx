import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { useUser } from '@/context/users';
import type { InvestigationReport } from '@/types/investigation';
import { INVESTIGATION_TYPES } from '@/types/investigation';
import { logError } from '@/utils/logger';

export default function InvestigationSignals() {
  const { t } = useTranslation('admin-signals');
  const { user } = useUser();
  const canViewAnalytics = user?.permissions?.some(
    (permission) => permission.type === 'VIEW_ANALYTICS',
  );
  const [days, setDays] = useState('7');
  const [type, setType] = useState<string | null>(null);
  const [player, setPlayer] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<InvestigationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    setSelected(null);
    setPage(1);
    fetch(`/api/admin/abuse/investigation-signals?days=${days}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setData(await response.json());
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          logError('Investigation signals failed', cause);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, retry]);
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected]);
  const findings = useMemo(
    () =>
      data?.findings
        .filter(
          (finding) =>
            (!type || finding.type === type) &&
            (!player || finding.players.some((p) => String(p.id) === player)),
        )
        .sort(
          (a, b) =>
            Number(b.type === 'COMBAT_ACCOUNTING') -
              Number(a.type === 'COMBAT_ACCOUNTING') ||
            b.lastSeen.localeCompare(a.lastSeen),
        ) ?? [],
    [data, type, player],
  );
  const detail = data?.findings.find((finding) => finding.key === selected);
  const playerLabel = (id: number) =>
    detail?.players.find((p) => p.id === id)?.name ?? `#${id}`;
  return (
    <Stack>
      <Alert title={t('readOnlyTitle')}>
        <Text size="sm">{t('intro')}</Text>
      </Alert>
      <Group align="end">
        <Select
          label={t('period')}
          value={days}
          onChange={(value) => value && setDays(value)}
          data={[
            { value: '7', label: t('days7') },
            { value: '30', label: t('days30') },
          ]}
          w={{ base: '100%', sm: 160 }}
        />
        <Select
          label={t('type')}
          clearable
          value={type}
          onChange={(value) => {
            setType(value);
            setPage(1);
            setSelected(null);
          }}
          data={INVESTIGATION_TYPES.map((value) => ({
            value,
            label: t(`types.${value}`),
          }))}
          style={{ minWidth: 200 }}
        />
        <TextInput
          label={t('playerId')}
          type="number"
          min={1}
          value={player}
          onChange={(event) => {
            setPlayer(event.currentTarget.value);
            setPage(1);
            setSelected(null);
          }}
          w={{ base: '100%', sm: 140 }}
        />
        <Button
          variant="default"
          onClick={() => setRetry((value) => value + 1)}
          disabled={loading}
        >
          {t('refresh')}
        </Button>
      </Group>
      {error && (
        <Alert color="red" role="alert">
          {t('loadError')}{' '}
          <Button
            onClick={() => {
              setDays('7');
              setRetry((value) => value + 1);
            }}
          >
            {t('retry')}
          </Button>
        </Alert>
      )}
      {loading ? (
        <Loader aria-label={t('loading')} />
      ) : (
        data && (
          <>
            <Text size="sm" c="dimmed">
              {t('window', {
                since: new Date(data.since).toLocaleString(),
                until: new Date(data.until).toLocaleString(),
              })}
            </Text>
            <Text size="sm" c="dimmed">
              {t('coverage', { ...data.snapshotCoverage })}{' '}
              {data.snapshotCoverage.capped ? t('snapshotCap') : ''}
            </Text>
            {data.limitedTypes.length > 0 && (
              <Alert color="yellow">
                {t('limited', {
                  types: data.limitedTypes
                    .map((value) => t(`types.${value}`))
                    .join(', '),
                })}
              </Alert>
            )}
            <Text>{t('findingCount', { count: findings.length })}</Text>
            <AdminDataTable ariaLabel={t('readOnlyTitle')} withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  {['type', 'players', 'events', 'lastSeen', 'evidence'].map(
                    (key) => (
                      <Table.Th key={key}>{t(key)}</Table.Th>
                    ),
                  )}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {findings.slice((page - 1) * 25, page * 25).map((finding) => (
                  <Table.Tr key={finding.key}>
                    <Table.Td>
                      <Text fw={600}>{t(`types.${finding.type}`)}</Text>
                      <Badge
                        variant="light"
                        color={
                          finding.type === 'COMBAT_ACCOUNTING'
                            ? 'yellow'
                            : 'gray'
                        }
                      >
                        {t(
                          finding.type === 'COMBAT_ACCOUNTING'
                            ? 'accountingReview'
                            : 'patternReview',
                        )}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {finding.players.map((p) => (
                        <Text key={p.id} size="sm">
                          {p.name} (#{p.id})
                        </Text>
                      ))}
                    </Table.Td>
                    <Table.Td>{finding.count.toLocaleString()}</Table.Td>
                    <Table.Td>
                      {new Date(finding.lastSeen).toLocaleString()}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="default"
                        aria-label={t('viewEvidence', {
                          type: t(`types.${finding.type}`),
                          id: finding.players[0]?.id,
                        })}
                        onClick={() => setSelected(finding.key)}
                      >
                        {t('evidence')}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AdminDataTable>
            {!findings.length && <Text c="dimmed">{t('empty')}</Text>}
            {findings.length > 25 && (
              <Pagination
                value={page}
                onChange={setPage}
                total={Math.ceil(findings.length / 25)}
              />
            )}
            {detail && (
              <section aria-label={t('evidence')}>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Title order={2} ref={heading} tabIndex={-1}>
                      {t(`types.${detail.type}`)}
                    </Title>
                    <Button variant="default" onClick={() => setSelected(null)}>
                      {t('close')}
                    </Button>
                  </Group>
                  <Text>{t(`rules.${detail.type}`)}</Text>
                  <Alert color="yellow" title={t('interpretation')}>
                    {t(`limitations.${detail.type}`)}
                  </Alert>
                  <Text size="sm">
                    {t('observedWindow', {
                      first: new Date(detail.firstSeen).toLocaleString(),
                      last: new Date(detail.lastSeen).toLocaleString(),
                    })}
                  </Text>
                  <AdminDataTable
                    size="compact"
                    ariaLabel={t('metric')}
                    withTableBorder
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('metric')}</Table.Th>
                        <Table.Th>{t('value')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {Object.entries(detail.metrics).map(([key, value]) => (
                        <Table.Tr key={key}>
                          <Table.Th>
                            {t(`metrics.${key}`, { defaultValue: key })}
                          </Table.Th>
                          <Table.Td>
                            {typeof value === 'boolean'
                              ? t(value ? 'yes' : 'no')
                              : String(value)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </AdminDataTable>
                  <Title order={3}>{t('sampleRecords')}</Title>
                  <Text size="sm" c="dimmed">
                    {t('sampleNote')}
                  </Text>
                  <AdminDataTable
                    ariaLabel={t('sampleRecords')}
                    withTableBorder
                  >
                    <Table.Thead>
                      <Table.Tr>
                        {['source', 'id', 'time', 'from', 'to', 'gold'].map(
                          (key) => (
                            <Table.Th key={key}>{t(key)}</Table.Th>
                          ),
                        )}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {detail.evidence.map((record, index) => (
                        <Table.Tr key={`${record.kind}:${record.id}:${index}`}>
                          <Table.Td>{t(`sources.${record.kind}`)}</Table.Td>
                          <Table.Td>
                            {record.kind === 'attack' && canViewAnalytics ? (
                              <Anchor
                                component={Link}
                                href={`/home/admin/attacks?attackId=${record.id}`}
                              >
                                #{record.id}
                              </Anchor>
                            ) : (
                              `#${record.id}`
                            )}
                          </Table.Td>
                          <Table.Td>
                            {record.at
                              ? new Date(record.at).toLocaleString()
                              : t('notAvailable')}
                          </Table.Td>
                          <Table.Td>
                            {record.from
                              ? `${playerLabel(record.from)} (#${record.from})`
                              : '—'}
                          </Table.Td>
                          <Table.Td>
                            {record.to
                              ? `${playerLabel(record.to)} (#${record.to})`
                              : '—'}
                          </Table.Td>
                          <Table.Td>{record.gold ?? '—'}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </AdminDataTable>
                  {canViewAnalytics && (
                    <Group>
                      {detail.players.map((p) => (
                        <Button
                          key={p.id}
                          component={Link}
                          variant="default"
                          href={`/home/admin/analytics?playerId=${p.id}&days=${days}`}
                        >
                          {t('playerTimeline', { name: p.name })}
                        </Button>
                      ))}
                    </Group>
                  )}
                </Stack>
              </section>
            )}
          </>
        )
      )}
    </Stack>
  );
}
