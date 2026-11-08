import {
  Alert,
  Badge,
  Button,
  Fieldset,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { alertService } from '@/services/Alert.service';
import type {
  CatalogBattleUpgrade,
  CatalogItem,
  CatalogUnit,
  UpgradesEditState,
} from '@/utils/adminUpgrades';
import { buildUpgradesPatch } from '@/utils/adminUpgrades';
import { logError } from '@/utils/logger';

interface UpgradesPayload {
  currentEraId: number | null;
  level: number;
  proficiencyPoints: { total: number; used: number };
  structureUpgrades: { type: string; level: number }[];
  battleUpgrades: { type: string; level: number; quantity: number }[];
  bonusPoints: { type: string; level: number }[];
  limits: {
    structureMaxLevel: Record<string, number>;
    bonusMaxLevel: number;
    bonusTypes: string[];
  };
  catalog: {
    units: CatalogUnit[];
    items: CatalogItem[];
    battleUpgrades: CatalogBattleUpgrade[];
  };
  missing: { units: CatalogUnit[]; items: CatalogItem[] };
}

interface PlayerUpgradesPanelProps {
  userId: number;
  /** Saving needs an administrator; other staff see the values only. */
  readOnly?: boolean;
}

const STRUCTURE_TYPES = ['OFFENSE', 'SPY', 'SENTRY', 'ARMORY'];
const toNumber = (value: string | number, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const PlayerUpgradesPanel: React.FC<PlayerUpgradesPanelProps> = ({
  userId,
  readOnly = false,
}) => {
  const { t } = useTranslation('admin-upgrades');
  const [data, setData] = useState<UpgradesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleEdit, setStaleEdit] = useState(false);
  const [structure, setStructure] = useState<Record<string, number>>({});
  const [battle, setBattle] = useState<Record<string, number>>({});
  const [bonus, setBonus] = useState<Record<string, number>>({});
  const [addUnits, setAddUnits] = useState<
    (CatalogUnit & { quantity: number })[]
  >([]);
  const [addItems, setAddItems] = useState<
    (CatalogItem & { quantity: number })[]
  >([]);
  const [unitPick, setUnitPick] = useState<string | null>(null);
  const [itemPick, setItemPick] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStaleEdit(false);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/upgrades`,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t('errors.load'));
      const next = payload as UpgradesPayload;
      setData(next);
      setStructure(
        Object.fromEntries(
          STRUCTURE_TYPES.map((type) => [
            type,
            next.structureUpgrades.find((s) => s.type === type)?.level ?? 1,
          ]),
        ),
      );
      setBattle(
        Object.fromEntries(
          next.catalog.battleUpgrades.map((b) => [
            `${b.type}_${b.level}`,
            next.battleUpgrades.find(
              (o) => o.type === b.type && o.level === b.level,
            )?.quantity ?? 0,
          ]),
        ),
      );
      setBonus(
        Object.fromEntries(
          next.limits.bonusTypes.map((type) => [
            type,
            next.bonusPoints.find((b) => b.type === type)?.level ?? 0,
          ]),
        ),
      );
      setAddUnits([]);
      setAddItems([]);
    } catch (requestError) {
      logError('Failed to load player upgrades', requestError);
      setError(
        requestError instanceof Error ? requestError.message : t('errors.load'),
      );
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const bonusUsed = useMemo(
    () => Object.values(bonus).reduce((sum, v) => sum + v, 0),
    [bonus],
  );
  const bonusOver = data ? bonusUsed > data.proficiencyPoints.total : false;

  const unitOptions = useMemo(
    () =>
      (data?.missing.units ?? [])
        .filter(
          (u) =>
            !addUnits.some((a) => a.type === u.type && a.level === u.level),
        )
        .map((u) => ({
          value: `${u.type}_${u.level}`,
          label: `${u.name} (${u.type} L${u.level})`,
        })),
    [data, addUnits],
  );
  const itemOptions = useMemo(
    () =>
      (data?.missing.items ?? [])
        .filter(
          (i) =>
            !addItems.some(
              (a) =>
                a.type === i.type && a.usage === i.usage && a.level === i.level,
            ),
        )
        .map((i) => ({
          value: `${i.type}_${i.usage}_${i.level}`,
          label: `${i.name} (${i.usage} ${i.type} L${i.level})`,
        })),
    [data, addItems],
  );

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    setError(null);
    try {
      const loaded: UpgradesEditState = {
        structure: Object.fromEntries(
          data.structureUpgrades.map((r) => [r.type, r.level]),
        ),
        battle: Object.fromEntries(
          data.battleUpgrades.map((r) => [`${r.type}_${r.level}`, r.quantity]),
        ),
        bonus: Object.fromEntries(
          data.bonusPoints.map((r) => [r.type, r.level]),
        ),
      };
      const body = buildUpgradesPatch(
        loaded,
        { structure, battle, bonus },
        { structure: 1, battle: 0, bonus: 0 },
        data.currentEraId ?? null,
        addUnits.map(({ type, level, quantity }) => ({
          type,
          level,
          quantity,
        })),
        addItems.map(({ type, usage, level, quantity }) => ({
          type,
          usage,
          level,
          quantity,
        })),
      );
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/upgrades`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409 && payload.code === 'STALE') {
        setStaleEdit(true);
        throw new Error(t('errors.stale'));
      }
      if (!response.ok) {
        const details = Array.isArray(payload.details)
          ? `: ${payload.details.join('; ')}`
          : '';
        throw new Error(`${payload.error || t('errors.save')}${details}`);
      }
      alertService.success(t('saved'));
      await load();
    } catch (requestError) {
      logError('Failed to save player upgrades', requestError);
      setError(
        requestError instanceof Error ? requestError.message : t('errors.save'),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <Group justify="center" p="md">
        <Loader size="sm" aria-label={t('loading')} />
      </Group>
    );
  }

  if (!data) {
    return (
      <Alert color="red" role="alert" title={t('title')}>
        {error ?? t('errors.load')}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" role="alert" title={t('title')}>
          {error}
          {staleEdit && (
            <Button
              mt="sm"
              variant="default"
              onClick={load}
              disabled={loading}
              display="block"
            >
              {t('actions.reload')}
            </Button>
          )}
        </Alert>
      )}
      {readOnly && <Text c="dimmed">{t('readOnly')}</Text>}
      <Fieldset variant="unstyled" disabled={readOnly}>
        <Stack gap="md">
          <GameCard title={t('sections.structure')}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('columns.type')}</Table.Th>
                  <Table.Th>{t('columns.level')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {STRUCTURE_TYPES.map((type) => (
                  <Table.Tr key={type}>
                    <Table.Td>{type}</Table.Td>
                    <Table.Td>
                      <NumberInput
                        aria-label={t('aria.structureLevel', { type })}
                        min={1}
                        max={data.limits.structureMaxLevel[type]}
                        clampBehavior="strict"
                        allowDecimal={false}
                        value={structure[type] ?? 1}
                        onChange={(v) =>
                          setStructure((s) => ({
                            ...s,
                            [type]: toNumber(v, 1),
                          }))
                        }
                        rightSection={
                          <Text size="xs" c="dimmed">
                            /{data.limits.structureMaxLevel[type]}
                          </Text>
                        }
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </GameCard>

          <GameCard title={t('sections.battle')}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('columns.upgrade')}</Table.Th>
                  <Table.Th>{t('columns.type')}</Table.Th>
                  <Table.Th>{t('columns.quantity')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.catalog.battleUpgrades.map((b) => {
                  const key = `${b.type}_${b.level}`;
                  return (
                    <Table.Tr key={key}>
                      <Table.Td>{b.name}</Table.Td>
                      <Table.Td>
                        {b.type} L{b.level}
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          aria-label={t('aria.quantity', { name: b.name })}
                          min={0}
                          allowDecimal={false}
                          allowNegative={false}
                          thousandSeparator=","
                          value={battle[key] ?? 0}
                          onChange={(v) =>
                            setBattle((s) => ({ ...s, [key]: toNumber(v) }))
                          }
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </GameCard>

          <GameCard title={t('sections.proficiency')}>
            <Group mb="sm">
              <Badge color={bonusOver ? 'red' : 'gray'}>
                {t('proficiencyUsed', {
                  used: bonusUsed,
                  total: data.proficiencyPoints.total,
                  level: data.level,
                })}
              </Badge>
            </Group>
            {bonusOver && (
              <Alert color="red" role="alert" mb="sm">
                {t('errors.bonusOver', { total: data.proficiencyPoints.total })}
              </Alert>
            )}
            <Table striped>
              <Table.Tbody>
                {data.limits.bonusTypes.map((type) => (
                  <Table.Tr key={type}>
                    <Table.Td>{type}</Table.Td>
                    <Table.Td>
                      <NumberInput
                        aria-label={t('aria.proficiencyLevel', { type })}
                        min={0}
                        max={data.limits.bonusMaxLevel}
                        clampBehavior="strict"
                        allowDecimal={false}
                        value={bonus[type] ?? 0}
                        onChange={(v) =>
                          setBonus((s) => ({ ...s, [type]: toNumber(v) }))
                        }
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </GameCard>

          <GameCard title={t('sections.addUnits')}>
            <Group align="flex-end" mb="sm">
              <Select
                label={t('fields.unit')}
                placeholder={
                  unitOptions.length
                    ? t('fields.chooseUnit')
                    : t('fields.noUnits')
                }
                data={unitOptions}
                value={unitPick}
                onChange={setUnitPick}
                searchable
                disabled={!unitOptions.length}
                style={{ flex: 1 }}
              />
              <Button
                variant="light"
                disabled={!unitPick}
                onClick={() => {
                  const unit = data.missing.units.find(
                    (u) => `${u.type}_${u.level}` === unitPick,
                  );
                  if (unit)
                    setAddUnits((s) => [...s, { ...unit, quantity: 0 }]);
                  setUnitPick(null);
                }}
              >
                {t('actions.add')}
              </Button>
            </Group>
            {addUnits.length > 0 && (
              <Table>
                <Table.Tbody>
                  {addUnits.map((u, index) => (
                    <Table.Tr key={`${u.type}_${u.level}`}>
                      <Table.Td>
                        {u.name} ({u.type} L{u.level})
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          aria-label={t('aria.quantity', { name: u.name })}
                          min={0}
                          allowDecimal={false}
                          allowNegative={false}
                          thousandSeparator=","
                          value={u.quantity}
                          onChange={(v) =>
                            setAddUnits((s) =>
                              s.map((row, i) =>
                                i === index
                                  ? { ...row, quantity: toNumber(v) }
                                  : row,
                              ),
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() =>
                            setAddUnits((s) => s.filter((_, i) => i !== index))
                          }
                        >
                          {t('actions.remove')}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </GameCard>

          <GameCard title={t('sections.addItems')}>
            <Group align="flex-end" mb="sm">
              <Select
                label={t('fields.item')}
                placeholder={
                  itemOptions.length
                    ? t('fields.chooseItem')
                    : t('fields.noItems')
                }
                data={itemOptions}
                value={itemPick}
                onChange={setItemPick}
                searchable
                disabled={!itemOptions.length}
                style={{ flex: 1 }}
              />
              <Button
                variant="light"
                disabled={!itemPick}
                onClick={() => {
                  const item = data.missing.items.find(
                    (i) => `${i.type}_${i.usage}_${i.level}` === itemPick,
                  );
                  if (item)
                    setAddItems((s) => [...s, { ...item, quantity: 0 }]);
                  setItemPick(null);
                }}
              >
                {t('actions.add')}
              </Button>
            </Group>
            {addItems.length > 0 && (
              <Table>
                <Table.Tbody>
                  {addItems.map((item, index) => (
                    <Table.Tr key={`${item.type}_${item.usage}_${item.level}`}>
                      <Table.Td>
                        {item.name} ({item.usage} {item.type} L{item.level})
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          aria-label={t('aria.quantity', { name: item.name })}
                          min={0}
                          allowDecimal={false}
                          allowNegative={false}
                          thousandSeparator=","
                          value={item.quantity}
                          onChange={(v) =>
                            setAddItems((s) =>
                              s.map((row, i) =>
                                i === index
                                  ? { ...row, quantity: toNumber(v) }
                                  : row,
                              ),
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() =>
                            setAddItems((s) => s.filter((_, i) => i !== index))
                          }
                        >
                          {t('actions.remove')}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </GameCard>
        </Stack>
      </Fieldset>

      {!readOnly && (
        <Group justify="flex-end">
          <Button variant="default" onClick={load} disabled={saving || loading}>
            {t('actions.reset')}
          </Button>
          <Button onClick={save} loading={saving} disabled={bonusOver}>
            {t('actions.save')}
          </Button>
        </Group>
      )}
    </Stack>
  );
};

export default PlayerUpgradesPanel;
