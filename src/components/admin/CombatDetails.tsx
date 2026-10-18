import { Code, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { ItemTypes } from '@/constants';
import type { adminCombatDetails } from '@/utils/adminCombat';

type RosterRow = {
  type: string;
  level: number;
  quantity: number;
  usage?: string;
};
const ROSTERS = ['units', 'mercenaries', 'items'];
function roster(value: unknown): RosterRow[] {
  return Array.isArray(value) ? (value as RosterRow[]) : [];
}
/** Units are keyed by type and level; armory items also by the role they equip. */
function rosterKey(row: RosterRow): string {
  return row.usage
    ? `${row.usage}:${row.type}:${row.level}`
    : `${row.type}:${row.level}`;
}
const ITEM_USAGE_ORDER = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
const ITEM_SLOT_ORDER = [
  'WEAPON',
  'HELM',
  'ARMOR',
  'BOOTS',
  'BRACERS',
  'SHIELD',
];
const titleCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();
/** Armory rows read as an item name over a dim "Role · Slot · Level" line. */
function rosterLabel(row: RosterRow): { name: string; detail?: string } {
  if (!row.usage) return { name: rosterKey(row) };
  const item = ItemTypes.find(
    (entry) =>
      entry.usage === row.usage &&
      entry.type === row.type &&
      entry.level === row.level,
  );
  return {
    name: item?.name ?? rosterKey(row),
    detail: `${titleCase(row.usage)} · ${titleCase(row.type)} · L${row.level}`,
  };
}
/** Groups armory by role, then slot, then tier so equal gear sits together. */
function compareItems(a: RosterRow, b: RosterRow): number {
  const order = (list: string[], value = '') =>
    list.includes(value) ? list.indexOf(value) : list.length;
  return (
    order(ITEM_USAGE_ORDER, a.usage) - order(ITEM_USAGE_ORDER, b.usage) ||
    order(ITEM_SLOT_ORDER, a.type) - order(ITEM_SLOT_ORDER, b.type) ||
    a.level - b.level
  );
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
                      .filter((key) => !ROSTERS.includes(key))
                      .map((key) => (
                        <Table.Tr key={key}>
                          <Table.Td fw={600}>
                            {t(`metrics.${key}`, { defaultValue: key })}
                          </Table.Td>
                          <Table.Td>{display(before[key])}</Table.Td>
                          <Table.Td>{display(after[key])}</Table.Td>
                          <Table.Td>{delta(before[key], after[key])}</Table.Td>
                        </Table.Tr>
                      ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {ROSTERS.map((key) => {
                const start = roster(before[key]);
                const end = roster(after[key]);
                // Armory lists only gear the player held, grouped by role and slot.
                const rows = [
                  ...new Map(
                    [...start, ...end].map((row) => [rosterKey(row), row]),
                  ).values(),
                ]
                  .filter(
                    (row) =>
                      key !== 'items' ||
                      [...start, ...end].some(
                        (other) =>
                          rosterKey(other) === rosterKey(row) &&
                          other.quantity > 0,
                      ),
                  )
                  .sort(key === 'items' ? compareItems : () => 0);
                const unitKeys = rows.map(rosterKey);
                return (
                  <Stack key={key} gap={4}>
                    <Text fw={600}>{t(`metrics.${key}`)}</Text>
                    {!unitKeys.length ? (
                      <Text size="sm" c="dimmed">
                        {before[key] == null || after[key] == null
                          ? t('notRecorded')
                          : t(key === 'items' ? 'noItems' : 'noUnits')}
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
                                (row) => rosterKey(row) === unitKey,
                              );
                              const b = end.find(
                                (row) => rosterKey(row) === unitKey,
                              );
                              const from =
                                before[key] == null
                                  ? null
                                  : (a?.quantity ??
                                    (details.completeSnapshots ? 0 : null));
                              const to =
                                after[key] == null ? null : (b?.quantity ?? 0);
                              const label = rosterLabel(
                                a ?? b ?? { type: '', level: 0, quantity: 0 },
                              );
                              return (
                                <Table.Tr key={unitKey}>
                                  <Table.Td>
                                    <Text size="sm" fw={600}>
                                      {label.name}
                                    </Text>
                                    {label.detail && (
                                      <Text size="xs" c="dimmed">
                                        {label.detail}
                                      </Text>
                                    )}
                                  </Table.Td>
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
                <Table.Td fw={600}>
                  {t(`metrics.${key}`, { defaultValue: key })}
                </Table.Td>
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
