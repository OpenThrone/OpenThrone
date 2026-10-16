import { Code, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import type { adminCombatDetails } from '@/utils/adminCombat';

type RosterRow = { type: string; level: number; quantity: number };
function roster(value: unknown): RosterRow[] {
  return Array.isArray(value) ? (value as RosterRow[]) : [];
}
export default function CombatDetails({
  details,
}: {
  details: ReturnType<typeof adminCombatDetails>;
}) {
  const { t } = useTranslation('admin-activity');
  const display = (value: unknown) =>
    value == null
      ? t('notRecorded')
      : typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);
  const delta = (before: unknown, after: unknown) => {
    try {
      if (before != null && after != null) {
        const difference = BigInt(String(after)) - BigInt(String(before));
        return `${difference > 0n ? '+' : ''}${difference.toLocaleString()}`;
      }
    } catch {
      /* Historical fractional values have no integer delta. */
    }
    return t('notRecorded');
  };
  const header = (
    <Table.Thead>
      <Table.Tr>
        {['value', 'before', 'after', 'change'].map((key) => (
          <Table.Th key={key}>{t(key)}</Table.Th>
        ))}
      </Table.Tr>
    </Table.Thead>
  );
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t(details.completeSnapshots ? 'snapshotNote' : 'legacyNote')}
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {(['attacker', 'defender'] as const).map((side) => {
          const before = details.before[side];
          const after = details.after[side];
          const keys = [
            ...new Set([...Object.keys(before), ...Object.keys(after)]),
          ];
          return (
            <Stack key={side} gap="xs">
              <Title order={3}>{t(side)}</Title>
              <Table.ScrollContainer minWidth={340}>
                <Table
                  striped
                  withTableBorder
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {header}
                  <Table.Tbody>
                    {keys
                      .filter((key) => !['units', 'mercenaries'].includes(key))
                      .map((key) => (
                        <Table.Tr key={key}>
                          <Table.Th>
                            {t(`metrics.${key}`, { defaultValue: key })}
                          </Table.Th>
                          <Table.Td>{display(before[key])}</Table.Td>
                          <Table.Td>{display(after[key])}</Table.Td>
                          <Table.Td>{delta(before[key], after[key])}</Table.Td>
                        </Table.Tr>
                      ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {['units', 'mercenaries'].map((key) => {
                const start = roster(before[key]);
                const end = roster(after[key]);
                const unitKeys = [
                  ...new Set(
                    [...start, ...end].map((row) => `${row.type}:${row.level}`),
                  ),
                ];
                return (
                  <Stack key={key} gap={4}>
                    <Text fw={600}>{t(`metrics.${key}`)}</Text>
                    {!unitKeys.length ? (
                      <Text size="sm" c="dimmed">
                        {before[key] == null || after[key] == null
                          ? t('notRecorded')
                          : t('noUnits')}
                      </Text>
                    ) : (
                      <Table.ScrollContainer minWidth={340}>
                        <Table
                          striped
                          withTableBorder
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {header}
                          <Table.Tbody>
                            {unitKeys.map((unitKey) => {
                              const a = start.find(
                                (row) => `${row.type}:${row.level}` === unitKey,
                              );
                              const b = end.find(
                                (row) => `${row.type}:${row.level}` === unitKey,
                              );
                              const from =
                                before[key] == null
                                  ? null
                                  : (a?.quantity ??
                                    (details.completeSnapshots ? 0 : null));
                              const to =
                                after[key] == null ? null : (b?.quantity ?? 0);
                              return (
                                <Table.Tr key={unitKey}>
                                  <Table.Th>{unitKey}</Table.Th>
                                  <Table.Td>{display(from)}</Table.Td>
                                  <Table.Td>{display(to)}</Table.Td>
                                  <Table.Td>{delta(from, to)}</Table.Td>
                                </Table.Tr>
                              );
                            })}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          );
        })}
      </SimpleGrid>
      <Title order={3}>{t('outcome')}</Title>
      <Table.ScrollContainer minWidth={360}>
        <Table striped>
          <Table.Tbody>
            {Object.entries(details.outcome).map(([key, value]) => (
              <Table.Tr key={key}>
                <Table.Th>
                  {t(`metrics.${key}`, { defaultValue: key })}
                </Table.Th>
                <Table.Td>{display(value)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {(['losses', 'wounded'] as const).map((key) => (
          <Stack gap="xs" key={key}>
            <Title order={3}>{t(key)}</Title>
            <Code block style={{ maxHeight: 260, overflow: 'auto' }}>
              {display(details[key])}
            </Code>
          </Stack>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
