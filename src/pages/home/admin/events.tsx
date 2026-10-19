import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { describeEventEffects } from '@/components/sidebar/ActiveEventsBanner';
import {
  type CitizenMultiplierScope,
  EVENT_DEFAULT_ACTIVITY_HOURS,
  EVENT_MAX_COST_DISCOUNT_PERCENT,
  EVENT_MAX_EXTRA_TURNS_PER_TICK,
  EVENT_MULTIPLIER_MAX,
  EVENT_MULTIPLIER_MIN,
  type GameEventEffects,
  hasPrimaryEffect,
  parseEventEffects,
} from '@/constants/gameEvents';
import { GameEventType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

interface GameEvent {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  eraId: number | null;
  era?: { id: number; name: string; endDate: string | null } | null;
  config: unknown;
}

interface EventForm {
  key: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  untilEraEnd: boolean;
  effects: GameEventEffects;
  activateNow: boolean;
}

type EffectKey =
  | 'xpMultiplier'
  | 'goldMultiplier'
  | 'dailyCitizenBonus'
  | 'citizenMultiplier'
  | 'extraTurnsPerTick'
  | 'unitCostDiscountPercent'
  | 'armoryCostDiscountPercent';

/** Value an effect starts at when the admin switches it on. */
const EFFECT_DEFAULTS: Record<EffectKey, number> = {
  xpMultiplier: 2,
  goldMultiplier: 2,
  dailyCitizenBonus: 100,
  citizenMultiplier: 2,
  extraTurnsPerTick: 1,
  unitCostDiscountPercent: 10,
  armoryCostDiscountPercent: 10,
};

const EFFECT_ORDER: EffectKey[] = [
  'xpMultiplier',
  'goldMultiplier',
  'dailyCitizenBonus',
  'citizenMultiplier',
  'extraTurnsPerTick',
  'unitCostDiscountPercent',
  'armoryCostDiscountPercent',
];

const SUPPORTED_TYPES: string[] = [
  GameEventType.CUSTOM,
  GameEventType.GOLD_MODIFIER,
];

const HOUR_MS = 60 * 60 * 1000;

function toLocalInput(value: string | Date | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const nowRounded = () => {
  const date = new Date();
  date.setSeconds(0, 0);
  return date;
};

const blankForm = (): EventForm => {
  const start = nowRounded();
  return {
    key: '',
    name: '',
    description: '',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(new Date(start.getTime() + 48 * HOUR_MS)),
    untilEraEnd: false,
    effects: {},
    activateNow: false,
  };
};

/** One-click starting points; every field stays editable before saving. */
const PRESETS: Array<{
  id: string;
  hours: number | null;
  effects: GameEventEffects;
}> = [
  { id: 'xpWeekend', hours: 48, effects: { xpMultiplier: 2 } },
  {
    id: 'citizenWeekend',
    hours: 48,
    effects: { citizenMultiplier: 2, citizenMultiplierScope: 'BOTH' },
  },
  {
    id: 'dailyCitizens',
    hours: null,
    effects: {
      dailyCitizenBonus: 100,
      dailyCitizenActivityHours: EVENT_DEFAULT_ACTIVITY_HOURS,
    },
  },
  { id: 'turnsWeekend', hours: 48, effects: { extraTurnsPerTick: 1 } },
  {
    id: 'trainingSale',
    hours: 24,
    effects: { unitCostDiscountPercent: 20, armoryCostDiscountPercent: 20 },
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const GameEventsPage = () => {
  const { t } = useTranslation('admin-game');
  const { t: tCommon } = useTranslation('common');
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<GameEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GameEvent | null>(null);
  const [form, setForm] = useState<EventForm>(blankForm);
  const [opened, { open, close }] = useDisclosure(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/admin/game/events');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setEvents(await response.json());
    } catch (error) {
      logError('Failed to load events:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const startCreate = (presetId?: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    const base = blankForm();
    setEditing(null);
    if (preset) {
      const start = nowRounded();
      setForm({
        ...base,
        name: t(`eventsForm.presets.${preset.id}`),
        untilEraEnd: preset.hours === null,
        endsAt:
          preset.hours === null
            ? base.endsAt
            : toLocalInput(new Date(start.getTime() + preset.hours * HOUR_MS)),
        effects: { ...preset.effects },
      });
    } else {
      setForm(base);
    }
    open();
  };

  const startEdit = (event: GameEvent) => {
    setEditing(event);
    const untilEraEnd = event.endsAt === null && event.eraId !== null;
    setForm({
      key: event.key,
      name: event.name,
      description: event.description ?? '',
      startsAt: toLocalInput(event.startsAt),
      endsAt: untilEraEnd
        ? toLocalInput(new Date(Date.now() + 48 * HOUR_MS))
        : toLocalInput(event.endsAt),
      untilEraEnd,
      effects: parseEventEffects(event.config),
      activateNow: false,
    });
    open();
  };

  const setEffect = <K extends keyof GameEventEffects>(
    key: K,
    value: GameEventEffects[K] | undefined,
  ) =>
    setForm((current) => {
      const effects = { ...current.effects };
      if (value === undefined) delete effects[key];
      else effects[key] = value;
      if (key === 'dailyCitizenBonus' && value === undefined)
        delete effects.dailyCitizenActivityHours;
      if (key === 'citizenMultiplier' && value === undefined)
        delete effects.citizenMultiplierScope;
      return { ...current, effects };
    });

  const toggleEffect = (key: EffectKey, enabled: boolean) => {
    setEffect(key, enabled ? EFFECT_DEFAULTS[key] : undefined);
    if (enabled && key === 'dailyCitizenBonus')
      setEffect('dailyCitizenActivityHours', EVENT_DEFAULT_ACTIVITY_HOURS);
    if (enabled && key === 'citizenMultiplier')
      setEffect('citizenMultiplierScope', 'BOTH');
  };

  const notifyError = (message: string) =>
    notifications.show({ title: t('eventsTitle'), message, color: 'red' });

  const submit = async () => {
    if (!form.name.trim() || !form.startsAt) {
      notifyError(t('eventsForm.nameAndStartRequired'));
      return;
    }
    if (
      !form.untilEraEnd &&
      (!form.endsAt || new Date(form.endsAt) <= new Date(form.startsAt))
    ) {
      notifyError(t('startsBeforeEnds'));
      return;
    }
    if (!hasPrimaryEffect(form.effects)) {
      notifyError(t('eventsForm.effectRequired'));
      return;
    }
    const key =
      form.key.trim() ||
      `${slugify(form.name) || 'event'}-${Date.now().toString(36)}`;
    setSaving(true);
    try {
      const response = await fetch(
        editing
          ? `/api/admin/game/events/${editing.id}`
          : '/api/admin/game/events',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            name: form.name.trim(),
            description: form.description || null,
            type: GameEventType.CUSTOM,
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: form.untilEraEnd
              ? null
              : new Date(form.endsAt).toISOString(),
            untilEraEnd: form.untilEraEnd,
            config: form.effects,
          }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const saved: GameEvent = await response.json();
      if (!editing && form.activateNow) {
        const activated = await fetch(`/api/admin/game/events/${saved.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activate' }),
        });
        if (!activated.ok) notifyError(t('actionError'));
      }
      close();
      await fetchEvents();
    } catch (error) {
      logError('Failed to save game event:', error);
      notifyError(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    event: GameEvent,
    action: 'activate' | 'deactivate' | 'delete',
  ) => {
    setBusyId(event.id);
    try {
      const response = await fetch(`/api/admin/game/events/${event.id}`, {
        method: action === 'delete' ? 'DELETE' : 'PUT',
        ...(action === 'delete'
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action }),
            }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await fetchEvents();
    } catch (error) {
      logError('Failed to change game event:', error);
      notifyError(action === 'delete' ? t('deleteError') : t('actionError'));
    } finally {
      setBusyId(null);
    }
  };

  /** What the event is doing right now, from its status and time window. */
  const phaseOf = (event: GameEvent) => {
    if (event.status !== 'ACTIVE')
      return event.status === 'DRAFT'
        ? { label: t('eventsForm.phase.draft'), color: 'gray' }
        : { label: t('eventsForm.phase.ended'), color: 'dark' };
    const now = Date.now();
    if (event.era?.endDate)
      return { label: t('eventsForm.phase.ended'), color: 'dark' };
    if (new Date(event.startsAt).getTime() > now)
      return { label: t('eventsForm.phase.scheduled'), color: 'blue' };
    if (event.endsAt && new Date(event.endsAt).getTime() <= now)
      return { label: t('eventsForm.phase.ended'), color: 'dark' };
    return { label: t('eventsForm.phase.running'), color: 'green' };
  };

  const rows = events.map((event) => {
    const supported = SUPPORTED_TYPES.includes(event.type);
    const phase = phaseOf(event);
    const effects = describeEventEffects(
      parseEventEffects(event.config),
      tCommon,
    );
    return (
      <Table.Tr key={event.id}>
        <Table.Td>
          <Text fw={600}>{event.name}</Text>
          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {event.key}
          </Text>
        </Table.Td>
        <Table.Td>
          {supported ? (
            <Group gap={4}>
              {effects.map((label) => (
                <Badge key={label} variant="light" color="yellow" tt="none">
                  {label}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              {t('otherType')}
            </Text>
          )}
        </Table.Td>
        <Table.Td style={{ minWidth: 110 }}>
          <Badge color={phase.color}>{phase.label}</Badge>
        </Table.Td>
        <Table.Td>{new Date(event.startsAt).toLocaleString()}</Table.Td>
        <Table.Td>
          {event.endsAt
            ? new Date(event.endsAt).toLocaleString()
            : t('eventsForm.untilEraEndOf', {
                era: event.era?.name ?? `#${event.eraId}`,
              })}
        </Table.Td>
        <Table.Td>
          <Group gap="xs" wrap="wrap">
            {supported ? (
              <>
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => startEdit(event)}
                >
                  {t('edit')}
                </Button>
                {event.status === 'ACTIVE' ? (
                  <Button
                    size="xs"
                    color="orange"
                    loading={busyId === event.id}
                    onClick={() => runAction(event, 'deactivate')}
                  >
                    {t('eventsForm.endNow')}
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    color="green"
                    loading={busyId === event.id}
                    disabled={Boolean(event.era?.endDate)}
                    onClick={() => runAction(event, 'activate')}
                  >
                    {t('activate')}
                  </Button>
                )}
                <Button
                  size="xs"
                  color="red"
                  variant="outline"
                  loading={busyId === event.id}
                  onClick={() => setDeleteTarget(event)}
                >
                  {t('delete')}
                </Button>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                {t('unsupportedEventHint')}
              </Text>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  const { effects } = form;
  const multiplierInput = (
    key: 'xpMultiplier' | 'goldMultiplier' | 'citizenMultiplier',
  ) => (
    <NumberInput
      aria-label={t(`eventsForm.effects.${key}`)}
      value={effects[key] ?? EFFECT_DEFAULTS[key]}
      min={EVENT_MULTIPLIER_MIN}
      max={EVENT_MULTIPLIER_MAX}
      step={0.25}
      decimalScale={2}
      suffix="×"
      w={120}
      onChange={(value) => typeof value === 'number' && setEffect(key, value)}
    />
  );
  const integerInput = (
    key:
      | 'dailyCitizenBonus'
      | 'extraTurnsPerTick'
      | 'unitCostDiscountPercent'
      | 'armoryCostDiscountPercent',
    min: number,
    max: number,
    suffix?: string,
  ) => (
    <NumberInput
      aria-label={t(`eventsForm.effects.${key}`)}
      value={effects[key] ?? EFFECT_DEFAULTS[key]}
      min={min}
      max={max}
      allowDecimal={false}
      thousandSeparator=","
      suffix={suffix}
      w={120}
      onChange={(value) => typeof value === 'number' && setEffect(key, value)}
    />
  );
  const effectInputs: Record<EffectKey, React.ReactNode> = {
    xpMultiplier: multiplierInput('xpMultiplier'),
    goldMultiplier: multiplierInput('goldMultiplier'),
    dailyCitizenBonus: integerInput('dailyCitizenBonus', 1, 100000),
    citizenMultiplier: multiplierInput('citizenMultiplier'),
    extraTurnsPerTick: integerInput(
      'extraTurnsPerTick',
      1,
      EVENT_MAX_EXTRA_TURNS_PER_TICK,
    ),
    unitCostDiscountPercent: integerInput(
      'unitCostDiscountPercent',
      1,
      EVENT_MAX_COST_DISCOUNT_PERCENT,
      '%',
    ),
    armoryCostDiscountPercent: integerInput(
      'armoryCostDiscountPercent',
      1,
      EVENT_MAX_COST_DISCOUNT_PERCENT,
      '%',
    ),
  };

  return (
    <AdminLayout title={t('eventsTitle')} permissions={['MANAGE_EVENTS']}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Text size="sm" c="dimmed" maw={680}>
            {t('eventsForm.intro')}
          </Text>
          <Group gap="xs">
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="default">{t('eventsForm.fromPreset')}</Button>
              </Menu.Target>
              <Menu.Dropdown>
                {PRESETS.map((preset) => (
                  <Menu.Item
                    key={preset.id}
                    onClick={() => startCreate(preset.id)}
                  >
                    {t(`eventsForm.presets.${preset.id}`)}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Button onClick={() => startCreate()}>{t('newEvent')}</Button>
          </Group>
        </Group>
        {loadError && (
          <Alert color="red" title={t('loadError')}>
            <Button size="xs" onClick={() => fetchEvents()}>
              {t('retry')}
            </Button>
          </Alert>
        )}
        <Paper withBorder p="xs">
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('name')}</Table.Th>
                  <Table.Th>{t('eventsForm.effectsHeading')}</Table.Th>
                  <Table.Th>{t('status')}</Table.Th>
                  <Table.Th>{t('startsAt')}</Table.Th>
                  <Table.Th>{t('endsAt')}</Table.Th>
                  <Table.Th>{t('actions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{!loading && rows}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {loading && (
            <Text ta="center" p="md" role="status">
              {t('loading')}
            </Text>
          )}
          {!loading && !loadError && events.length === 0 && (
            <Text ta="center" c="dimmed" p="md">
              {t('emptyEvents')}
            </Text>
          )}
        </Paper>
      </Stack>
      <Modal
        opened={opened}
        onClose={() => {
          if (!saving) close();
        }}
        title={editing ? t('editEvent') : t('newEvent')}
        size="lg"
      >
        <Stack>
          <TextInput
            label={t('eventName')}
            value={form.name}
            maxLength={200}
            data-autofocus
            onChange={(e) => {
              const name = e.currentTarget.value;
              setForm((current) => ({ ...current, name }));
            }}
          />
          <Textarea
            label={t('description')}
            value={form.description}
            maxLength={2000}
            autosize
            minRows={2}
            maxRows={5}
            onChange={(e) => {
              const description = e.currentTarget.value;
              setForm((current) => ({ ...current, description }));
            }}
          />
          <Group grow align="flex-end">
            <TextInput
              label={t('startsAt')}
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => {
                const startsAt = e.currentTarget.value;
                setForm((current) => ({ ...current, startsAt }));
              }}
            />
            {!form.untilEraEnd && (
              <TextInput
                label={t('endsAt')}
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => {
                  const endsAt = e.currentTarget.value;
                  setForm((current) => ({ ...current, endsAt }));
                }}
              />
            )}
          </Group>
          <Checkbox
            label={t('eventsForm.untilEraEnd')}
            description={t('eventsForm.untilEraEndHint')}
            checked={form.untilEraEnd}
            onChange={(e) => {
              const untilEraEnd = e.currentTarget.checked;
              setForm((current) => ({ ...current, untilEraEnd }));
            }}
          />
          <Divider
            label={t('eventsForm.effectsHeading')}
            labelPosition="left"
          />
          <Stack gap="sm">
            {EFFECT_ORDER.map((key) => {
              const enabled = effects[key] !== undefined;
              return (
                <Stack key={key} gap={6}>
                  <Group justify="space-between" wrap="nowrap" mih={36}>
                    <Switch
                      label={t(`eventsForm.effects.${key}`)}
                      description={t(`eventsForm.effectHints.${key}`)}
                      checked={enabled}
                      onChange={(e) =>
                        toggleEffect(key, e.currentTarget.checked)
                      }
                    />
                    {enabled && effectInputs[key]}
                  </Group>
                  {enabled && key === 'dailyCitizenBonus' && (
                    <NumberInput
                      ml={54}
                      maw={320}
                      label={t('eventsForm.effects.dailyCitizenActivityHours')}
                      description={t(
                        'eventsForm.effectHints.dailyCitizenActivityHours',
                      )}
                      value={
                        effects.dailyCitizenActivityHours ??
                        EVENT_DEFAULT_ACTIVITY_HOURS
                      }
                      min={0}
                      max={720}
                      allowDecimal={false}
                      onChange={(value) =>
                        typeof value === 'number' &&
                        setEffect('dailyCitizenActivityHours', value)
                      }
                    />
                  )}
                  {enabled && key === 'citizenMultiplier' && (
                    <SegmentedControl
                      ml={54}
                      w="fit-content"
                      aria-label={t(
                        'eventsForm.effects.citizenMultiplierScope',
                      )}
                      value={effects.citizenMultiplierScope ?? 'BOTH'}
                      onChange={(value) =>
                        setEffect(
                          'citizenMultiplierScope',
                          value as CitizenMultiplierScope,
                        )
                      }
                      data={[
                        {
                          value: 'DAILY',
                          label: t('eventsForm.scope.DAILY'),
                        },
                        {
                          value: 'RECRUITING',
                          label: t('eventsForm.scope.RECRUITING'),
                        },
                        { value: 'BOTH', label: t('eventsForm.scope.BOTH') },
                      ]}
                    />
                  )}
                </Stack>
              );
            })}
          </Stack>
          <Divider />
          <TextInput
            label={t('eventKey')}
            description={editing ? undefined : t('eventsForm.keyHint')}
            value={form.key}
            maxLength={100}
            disabled={!!editing}
            onChange={(e) => {
              const key = e.currentTarget.value;
              setForm((current) => ({ ...current, key }));
            }}
          />
          {!editing && (
            <Checkbox
              label={t('eventsForm.activateNow')}
              checked={form.activateNow}
              onChange={(e) => {
                const activateNow = e.currentTarget.checked;
                setForm((current) => ({ ...current, activateNow }));
              }}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button onClick={() => submit()} loading={saving}>
              {editing ? t('save') : t('create')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) runAction(deleteTarget, 'delete');
          setDeleteTarget(null);
        }}
        title={t('delete')}
        message={t('deleteConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isLoading={deleteTarget !== null && busyId === deleteTarget.id}
        type="remove"
      />
    </AdminLayout>
  );
};

export const getServerSideProps = async ({ locale }: { locale?: string }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-game',
    ])),
  },
});

export default GameEventsPage;
