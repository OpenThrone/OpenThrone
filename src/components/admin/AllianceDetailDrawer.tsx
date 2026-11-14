import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import {
  type AllianceAdminActionInput,
  canForceEndWar,
  loanAdminAction,
  loanRemaining,
} from '@/components/admin/allianceAdminActions';
import ConfirmationModal from '@/components/ConfirmationModal';
import {
  ALLIANCE_DUES_MAX,
  ALLIANCE_DUES_PERIODS,
  ALLIANCE_JOIN_FEE_MAX,
  type AllianceDuesPeriod,
  isAllianceDuesPeriod,
  validateAllianceDuesSettingsDetailed,
} from '@/constants/allianceDues';
import { ALLIANCE_LEVELS, getAllianceLevel } from '@/constants/allianceLevels';
import { alertService } from '@/services/Alert.service';
import { allianceErrorText } from '@/utils/allianceErrorMessage';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';
import {
  wholeGoldInput,
  wholeGoldSeparators,
  wholeGoldValue,
} from '@/utils/wholeGoldInput';

type UserRef = { id: number; display_name: string } | null;
type Row = Record<string, any>;

interface AllianceDetail {
  alliance: Row & { id: number; name: string; leader_id: number };
  members: Row[];
  roles: Row[];
  cooldowns: Row[];
  treasury: {
    balance: string;
    bankHistory: Row[];
    goldRequests: Row[];
    loans: (Row & { amount_owed: string; amount_repaid: string })[];
    fees: Row[];
  };
  wars: Row[];
  joinRequests: Row[];
  upgrades: Row[];
  relations: Row[];
  targetCalls: Row[];
  intelCount: number;
}

interface PendingAction {
  input: AllianceAdminActionInput;
  title: string;
  message: string;
  destructive: boolean;
}

const who = (user: UserRef | undefined, fallbackId?: number | null) =>
  user
    ? `${user.display_name} (#${user.id})`
    : fallbackId
      ? `#${fallbackId}`
      : '—';
// Dates and gold in the admin page's language, like the inputs above them.
const when = (value?: string | null, locale?: string) =>
  value ? new Date(value).toLocaleString(locale) : '—';
const gold = (value?: string | number | null, locale?: string) =>
  value == null ? '—' : toBigIntSafe(value).toLocaleString(locale);

const SimpleTable = ({
  label,
  head,
  rows,
  emptyText,
}: {
  label: string;
  head: string[];
  rows: ReactNode[][];
  emptyText: string;
}) =>
  rows.length === 0 ? (
    <Text c="dimmed" size="sm">
      {emptyText}
    </Text>
  ) : (
    <AdminDataTable ariaLabel={label}>
      <Table.Thead>
        <Table.Tr>
          {head.map((h) => (
            <Table.Th key={h}>{h}</Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((cells, i) => (
          <Table.Tr key={i}>
            {cells.map((cell, j) => (
              <Table.Td key={j}>{cell}</Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </AdminDataTable>
  );

/** Alliance detail and admin actions for the alliance admin page (#229). */
export const AllianceDetailDrawer = ({
  allianceId,
  onClose,
  onChanged,
}: {
  allianceId: number | null;
  onClose: () => void;
  /** Called after a successful action so the list can refresh. */
  onChanged: () => void;
}) => {
  const { t, i18n } = useTranslation('admin-alliances');
  const [detail, setDetail] = useState<AllianceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLeader, setNewLeader] = useState<string | null>(null);
  const [hallLevel, setHallLevel] = useState<string | null>(null);
  const [dues, setDues] = useState<{
    joinFee: number | '';
    duesAmount: number | '';
    duesPeriod: AllianceDuesPeriod;
  } | null>(null);

  const load = useCallback(async () => {
    if (allianceId === null) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/game/alliances/${allianceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AllianceDetail = await res.json();
      setDetail(data);
      setNewName(data.alliance.name);
      setNewLeader(null);
      setHallLevel(null);
      setDues(null);
    } catch (err) {
      logError('Failed to load alliance detail:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [allianceId]);

  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);

  const runPending = async () => {
    if (!pending || allianceId === null) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/game/alliances/${allianceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertService.notify('error', data?.error ?? t('actionFailed'), {
          title: pending.title,
        });
        return;
      }
      alertService.notify('success', data?.message ?? t('actionDone'), {
        title: pending.title,
      });
      onChanged();
      await load();
    } catch (err) {
      logError('Admin alliance action failed:', err);
      alertService.notify('error', t('actionFailed'), {
        title: pending.title,
      });
    } finally {
      setSubmitting(false);
      setPending(null);
    }
  };

  const ask = (
    input: AllianceAdminActionInput,
    title: string,
    message: string,
    destructive = true,
  ) => setPending({ input, title, message, destructive });

  const a = detail?.alliance;
  const leaderId = a?.leader_id;
  const none = t('none');
  // Loaded fee and dues; `dues` holds the admin's unsaved edit.
  const storedDues = {
    joinFee: Number(toBigIntSafe(a?.join_fee ?? 0)),
    duesAmount: Number(toBigIntSafe(a?.dues_amount ?? 0)),
    duesPeriod: isAllianceDuesPeriod(a?.dues_period)
      ? a.dues_period
      : ('NONE' as AllianceDuesPeriod),
  };
  // `editedDues` is what the inputs show (a cleared field stays empty);
  // `duesInput` is what it means, an empty field counting as 0.
  const editedDues = dues ?? storedDues;
  const duesInput = {
    joinFee: wholeGoldValue(editedDues.joinFee),
    duesAmount: wholeGoldValue(editedDues.duesAmount),
    duesPeriod: editedDues.duesPeriod,
  };
  const duesRefusalDetail = validateAllianceDuesSettingsDetailed({
    joinFee: BigInt(duesInput.joinFee),
    duesAmount: BigInt(duesInput.duesAmount),
    duesPeriod: duesInput.duesPeriod,
  });
  const duesRefusal = duesRefusalDetail
    ? allianceErrorText(duesRefusalDetail)
    : null;
  const duesChanged =
    duesInput.joinFee !== storedDues.joinFee ||
    duesInput.duesAmount !== storedDues.duesAmount ||
    duesInput.duesPeriod !== storedDues.duesPeriod;
  const setDuesField = (patch: Partial<NonNullable<typeof dues>>) =>
    setDues({ ...editedDues, ...patch });

  return (
    <Drawer
      opened={allianceId !== null}
      onClose={onClose}
      position="right"
      size="xl"
      title={a ? `${a.name} (#${a.id})` : t('drawerTitle')}
    >
      {loading && !detail && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}
      {loadError && (
        <Alert color="red" title={t('loadError')} mb="md">
          <Button variant="default" size="xs" onClick={load}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      {detail && a && (
        <Tabs defaultValue="members" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="members">
              {t('tabMembers', { count: detail.members.length })}
            </Tabs.Tab>
            <Tabs.Tab value="treasury">{t('tabTreasury')}</Tabs.Tab>
            <Tabs.Tab value="wars">
              {t('tabWars', { count: detail.wars.length })}
            </Tabs.Tab>
            <Tabs.Tab value="other">{t('tabOther')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="members">
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Group align="end" gap="xs" wrap="nowrap">
                  <TextInput
                    label={t('renameLabel')}
                    value={newName}
                    onChange={(e) => setNewName(e.currentTarget.value)}
                    maxLength={100}
                    style={{ flex: 1 }}
                  />
                  <Button
                    disabled={!newName.trim() || newName.trim() === a.name}
                    onClick={() =>
                      ask(
                        { action: 'rename', name: newName.trim() },
                        t('renameLabel'),
                        t('renameConfirm', {
                          from: a.name,
                          to: newName.trim(),
                        }),
                        false,
                      )
                    }
                  >
                    {t('rename')}
                  </Button>
                </Group>
                <Group align="end" gap="xs" wrap="nowrap">
                  <Select
                    label={t('transferLabel')}
                    placeholder={t('chooseMember')}
                    data={detail.members
                      .filter((m) => m.user_id !== leaderId)
                      .map((m) => ({
                        value: String(m.user_id),
                        label: who(m.user, m.user_id),
                      }))}
                    value={newLeader}
                    onChange={setNewLeader}
                    searchable
                    style={{ flex: 1 }}
                  />
                  <Button
                    disabled={!newLeader}
                    onClick={() =>
                      newLeader &&
                      ask(
                        {
                          action: 'transfer_leadership',
                          newLeaderId: Number(newLeader),
                        },
                        t('transferLabel'),
                        t('transferConfirm', {
                          id: newLeader,
                          name: a.name,
                        }),
                      )
                    }
                  >
                    {t('transfer')}
                  </Button>
                </Group>
              </SimpleGrid>
              <Text size="sm">
                {t('summary', {
                  leader: who(a.leader, leaderId),
                  tier: a.xp_record?.tier ?? 1,
                  joinMode: a.join_mode,
                })}
              </Text>
              <Group gap="xs" aria-label={t('statusLabel')}>
                <Badge
                  color={a.status === 'RESERVED' ? 'orange' : 'green'}
                  variant="light"
                >
                  {a.status === 'RESERVED'
                    ? t('statusReserved')
                    : t('statusActive')}
                </Badge>
                {a.status_changed_at && (
                  <Text size="xs" c="dimmed">
                    {t('statusSince', {
                      date: new Date(a.status_changed_at).toLocaleString(),
                    })}
                  </Text>
                )}
                <Button
                  size="xs"
                  variant="default"
                  onClick={() =>
                    a.status === 'RESERVED'
                      ? ask(
                          { action: 'reactivate' },
                          t('reactivateTitle'),
                          t('reactivateConfirm', { name: a.name }),
                          false,
                        )
                      : ask(
                          { action: 'reserve' },
                          t('reserveTitle'),
                          t('reserveConfirm', { name: a.name }),
                        )
                  }
                >
                  {a.status === 'RESERVED' ? t('reactivate') : t('reserve')}
                </Button>
              </Group>
              <Group align="end" gap="xs" wrap="nowrap">
                <Select
                  label={t('hallLevelLabel')}
                  description={t('hallLevelHint', {
                    members: detail.members.length,
                    cap: getAllianceLevel(a.hall_level).maxMembers,
                  })}
                  data={ALLIANCE_LEVELS.map((level) => ({
                    value: String(level.level),
                    label: `${level.level} · ${t(`hallLevels.${level.level}`)}`,
                  }))}
                  value={
                    hallLevel ?? String(getAllianceLevel(a.hall_level).level)
                  }
                  onChange={setHallLevel}
                  allowDeselect={false}
                  style={{ flex: 1 }}
                />
                <Button
                  disabled={
                    hallLevel === null ||
                    Number(hallLevel) === getAllianceLevel(a.hall_level).level
                  }
                  onClick={() =>
                    hallLevel !== null &&
                    ask(
                      {
                        action: 'set_hall_level',
                        level: Number(hallLevel),
                        fromLevel: getAllianceLevel(a.hall_level).level,
                      },
                      t('hallLevelLabel'),
                      t('hallLevelConfirm', {
                        name: a.name,
                        from: getAllianceLevel(a.hall_level).level,
                        to: hallLevel,
                      }),
                      false,
                    )
                  }
                >
                  {t('hallLevelSet')}
                </Button>
              </Group>
              <Stack gap="xs">
                <Text fw={700}>{t('duesHeading')}</Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  <NumberInput
                    label={t('duesJoinFee')}
                    description={t('duesMax', {
                      max: ALLIANCE_JOIN_FEE_MAX.toLocaleString(i18n.language),
                    })}
                    min={0}
                    max={Number(ALLIANCE_JOIN_FEE_MAX)}
                    allowDecimal={false}
                    allowNegative={false}
                    {...wholeGoldSeparators(i18n.language)}
                    value={editedDues.joinFee}
                    onChange={(v) =>
                      setDuesField({ joinFee: wholeGoldInput(v) })
                    }
                  />
                  <Select
                    label={t('duesPeriod')}
                    data={ALLIANCE_DUES_PERIODS.map((period) => ({
                      value: period,
                      label: t(`duesPeriods.${period}`),
                    }))}
                    value={editedDues.duesPeriod}
                    onChange={(v) =>
                      isAllianceDuesPeriod(v) &&
                      setDuesField({
                        duesPeriod: v,
                        ...(v === 'NONE' ? { duesAmount: 0 } : {}),
                      })
                    }
                    allowDeselect={false}
                  />
                  <NumberInput
                    label={t('duesAmount')}
                    description={
                      editedDues.duesPeriod === 'NONE'
                        ? t('duesAmountNone')
                        : t('duesMax', {
                            max: ALLIANCE_DUES_MAX[
                              editedDues.duesPeriod
                            ].toLocaleString(i18n.language),
                          })
                    }
                    min={0}
                    max={
                      editedDues.duesPeriod === 'NONE'
                        ? 0
                        : Number(ALLIANCE_DUES_MAX[editedDues.duesPeriod])
                    }
                    disabled={editedDues.duesPeriod === 'NONE'}
                    allowDecimal={false}
                    allowNegative={false}
                    {...wholeGoldSeparators(i18n.language)}
                    value={editedDues.duesAmount}
                    onChange={(v) =>
                      setDuesField({ duesAmount: wholeGoldInput(v) })
                    }
                  />
                </SimpleGrid>
                {duesChanged && duesRefusal && (
                  <Text size="sm" c="red" role="alert">
                    {duesRefusal}
                  </Text>
                )}
                <Group>
                  <Button
                    disabled={!duesChanged || !!duesRefusal}
                    onClick={() =>
                      ask(
                        {
                          action: 'set_dues',
                          ...duesInput,
                          expected: storedDues,
                        },
                        t('duesHeading'),
                        t('duesConfirm', {
                          name: a.name,
                          fee: duesInput.joinFee.toLocaleString(i18n.language),
                          amount: duesInput.duesAmount.toLocaleString(
                            i18n.language,
                          ),
                          period: t(`duesPeriods.${editedDues.duesPeriod}`),
                        }),
                        false,
                      )
                    }
                  >
                    {t('duesSave')}
                  </Button>
                </Group>
              </Stack>
              <SimpleTable
                label={t('membersHeading')}
                emptyText={none}
                head={[
                  t('colMember'),
                  t('colRank'),
                  t('colJoined'),
                  t('colDuesArrears'),
                  t('colActions'),
                ]}
                rows={detail.members.map((m) => {
                  const cooldown = detail.cooldowns.filter(
                    (c) => c.user_id === m.user_id,
                  );
                  const name = who(m.user, m.user_id);
                  return [
                    <>
                      {name}{' '}
                      {m.user_id === leaderId && (
                        <Badge size="xs">{t('leaderBadge')}</Badge>
                      )}
                    </>,
                    m.role?.name ?? '—',
                    when(m.created_at, i18n.language),
                    m.user_id === leaderId
                      ? '—'
                      : gold(m.dues_arrears ?? 0, i18n.language),
                    m.user_id === leaderId ? (
                      '—'
                    ) : (
                      <Group gap="xs">
                        <Button
                          size="xs"
                          color="red"
                          onClick={() =>
                            ask(
                              { action: 'remove_member', userId: m.user_id },
                              t('removeTitle'),
                              t('removeConfirm', { name }),
                            )
                          }
                        >
                          {t('remove')}
                        </Button>
                        {cooldown.length > 0 && (
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                              ask(
                                {
                                  action: 'clear_cooldowns',
                                  userId: m.user_id,
                                },
                                t('clearCooldownTitle'),
                                t('clearCooldownConfirm', { name }),
                                false,
                              )
                            }
                          >
                            {t('clearCooldownTitle')}
                          </Button>
                        )}
                      </Group>
                    ),
                  ];
                })}
              />
              <Text fw={700}>{t('cooldownsHeading')}</Text>
              <SimpleTable
                label={t('cooldownsHeading')}
                emptyText={none}
                head={[
                  t('colPlayer'),
                  t('colType'),
                  t('colExpires'),
                  t('colActions'),
                ]}
                rows={detail.cooldowns.map((c) => [
                  who(c.user, c.user_id),
                  c.type,
                  when(c.expires_at, i18n.language),
                  <Button
                    key="clear"
                    size="xs"
                    variant="default"
                    onClick={() =>
                      ask(
                        { action: 'clear_cooldowns', userId: c.user_id },
                        t('clearCooldownTitle'),
                        t('clearCooldownConfirm', {
                          name: who(c.user, c.user_id),
                        }),
                        false,
                      )
                    }
                  >
                    {t('clear')}
                  </Button>,
                ])}
              />
              <Text fw={700}>{t('ranksHeading')}</Text>
              <SimpleTable
                label={t('ranksHeading')}
                emptyText={none}
                head={[t('colOrder'), t('colName')]}
                rows={detail.roles.map((r) => [r.rank_order, r.name])}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="treasury">
            <Stack gap="md">
              <Text size="lg" fw={700}>
                {t('balance', {
                  amount: gold(detail.treasury.balance, i18n.language),
                })}
              </Text>
              <Text fw={700}>{t('loansHeading')}</Text>
              <SimpleTable
                label={t('loansHeading')}
                emptyText={none}
                head={[
                  t('colId'),
                  t('colBorrower'),
                  t('colStatus'),
                  t('colPrincipal'),
                  t('colOutstanding'),
                  t('colDue'),
                  t('colActions'),
                ]}
                rows={detail.treasury.loans.map((l) => {
                  const action = loanAdminAction(l.status);
                  const outstanding = gold(
                    loanRemaining(l).toString(),
                    i18n.language,
                  );
                  const forgive = action === 'forgive_loan';
                  return [
                    l.id,
                    who(l.borrower, l.borrower_id),
                    l.status,
                    gold(l.principal, i18n.language),
                    outstanding,
                    when(l.due_at, i18n.language),
                    action ? (
                      <Button
                        size="xs"
                        color={forgive ? 'red' : undefined}
                        variant={forgive ? 'filled' : 'default'}
                        onClick={() =>
                          ask(
                            { action, loanId: l.id },
                            forgive ? t('forgiveTitle') : t('cancelLoanTitle'),
                            forgive
                              ? t('forgiveConfirm', { id: l.id, outstanding })
                              : t('cancelLoanConfirm', { id: l.id }),
                          )
                        }
                      >
                        {forgive ? t('forgive') : t('cancelLoan')}
                      </Button>
                    ) : (
                      '—'
                    ),
                  ];
                })}
              />
              <Text fw={700}>{t('goldRequestsHeading')}</Text>
              <SimpleTable
                label={t('goldRequestsHeading')}
                emptyText={none}
                head={[
                  t('colId'),
                  t('colRequester'),
                  t('colAmount'),
                  t('colStatus'),
                  t('colDecidedBy'),
                  t('colCreated'),
                ]}
                rows={detail.treasury.goldRequests.map((g) => [
                  g.id,
                  who(g.requester, g.requester_id),
                  gold(g.amount, i18n.language),
                  g.status,
                  who(g.decider, g.decided_by),
                  when(g.created_at, i18n.language),
                ])}
              />
              <Text fw={700}>{t('feesHeading')}</Text>
              <SimpleTable
                label={t('feesHeading')}
                emptyText={none}
                head={[t('colFrequency'), t('colAmount'), t('colNextRun')]}
                rows={detail.treasury.fees.map((f) => [
                  f.frequency,
                  gold(f.amount, i18n.language),
                  when(f.next_run_at, i18n.language),
                ])}
              />
              <Text fw={700}>{t('historyHeading')}</Text>
              <SimpleTable
                label={t('historyHeading')}
                emptyText={none}
                head={[
                  t('colWhen'),
                  t('colType'),
                  t('colAmount'),
                  t('colBy'),
                  t('colMember'),
                  t('colNotes'),
                ]}
                rows={detail.treasury.bankHistory.map((h) => [
                  when(h.created_at, i18n.language),
                  h.transaction_type,
                  gold(h.amount, i18n.language),
                  who(h.performed_by_user, h.performed_by_user_id),
                  who(h.related_user, h.related_user_id),
                  h.notes ?? '—',
                ])}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="wars">
            <SimpleTable
              label={t('warsHeading')}
              emptyText={none}
              head={[
                t('colId'),
                t('colAttacker'),
                t('colDefender'),
                t('colStatus'),
                t('colTargets'),
                t('colStarted'),
                t('colActions'),
              ]}
              rows={detail.wars.map((w) => [
                w.id,
                w.attacker_alliance?.name ?? `#${w.attacker_alliance_id}`,
                w.defender_alliance?.name ??
                  who(w.defender_user, w.defender_user_id),
                w.status,
                w.targets?.length
                  ? w.targets
                      .map((tg: Row) => who(tg.target_user, tg.target_user_id))
                      .join(', ')
                  : '—',
                when(w.start_at, i18n.language),
                canForceEndWar(w.status) ? (
                  <Button
                    size="xs"
                    color="red"
                    onClick={() =>
                      ask(
                        { action: 'end_war', warId: w.id },
                        t('endWar'),
                        t('endWarConfirm', { id: w.id }),
                      )
                    }
                  >
                    {t('endWar')}
                  </Button>
                ) : (
                  '—'
                ),
              ])}
            />
          </Tabs.Panel>

          <Tabs.Panel value="other">
            <Stack gap="md">
              <Text fw={700}>{t('diplomacyHeading')}</Text>
              <SimpleTable
                label={t('diplomacyHeading')}
                emptyText={none}
                head={[
                  t('colAlliance'),
                  t('colOther'),
                  t('colStatus'),
                  t('colSince'),
                ]}
                rows={detail.relations.map((r) => [
                  r.alliance?.name,
                  r.other_alliance?.name,
                  r.status,
                  when(r.accepted_at ?? r.created_at, i18n.language),
                ])}
              />
              <Text fw={700}>{t('callsHeading')}</Text>
              <SimpleTable
                label={t('callsHeading')}
                emptyText={none}
                head={[
                  t('colType'),
                  t('colTarget'),
                  t('colNote'),
                  t('colCreated'),
                ]}
                rows={detail.targetCalls.map((c) => [
                  c.call_type,
                  who(c.target_user, c.target_user_id),
                  c.note ?? '—',
                  when(c.created_at, i18n.language),
                ])}
              />
              <Text size="sm">
                {t('intelCount', { count: detail.intelCount })}
              </Text>
              <Text fw={700}>{t('joinRequestsHeading')}</Text>
              <SimpleTable
                label={t('joinRequestsHeading')}
                emptyText={none}
                head={[t('colPlayer'), t('colKind'), t('colCreated')]}
                rows={detail.joinRequests.map((j) => [
                  who(j.user, j.user_id),
                  j.kind,
                  when(j.created_at, i18n.language),
                ])}
              />
              <Text fw={700}>{t('upgradesHeading')}</Text>
              <SimpleTable
                label={t('upgradesHeading')}
                emptyText={none}
                head={[t('colUpgrade'), t('colTier'), t('colPurchased')]}
                rows={detail.upgrades.map((u) => [
                  u.upgrade_key,
                  u.tier,
                  when(u.purchased_at, i18n.language),
                ])}
              />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}
      <ConfirmationModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={runPending}
        title={pending?.title ?? ''}
        message={pending?.message}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
        isLoading={submitting}
        type={pending?.destructive ? 'destructive' : 'primary'}
      />
    </Drawer>
  );
};

export default AllianceDetailDrawer;
