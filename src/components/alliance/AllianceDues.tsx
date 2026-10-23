import {
  Alert,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import type { AllianceForcesData } from '@/components/alliance/AllianceForces';
import { GameCard } from '@/components/game/GameCard';

export interface ForceDueView {
  id: number;
  userId: number;
  title: string;
  type: string | null;
  level: number | null;
  amountGold: string;
  paidGold: string;
  quantity: number;
  paidQuantity: number;
  fineGold: string;
  paidFineGold: string;
  dueAt: string;
  cancelledAt: string | null;
  enforcement?: AllianceForcesData['policy']['enforcement'];
  collectionUnitId: number | null;
}
export interface ForceRuleView {
  id: number;
  roleId: number;
  minLevel: number;
  type: string | null;
  level: number | null;
  amountGold: string;
  quantity: number;
  intervalDays: number;
  dueDays: number;
  enabled: boolean;
}
export interface AllianceDuesData {
  obligations: ForceDueView[];
  rules: ForceRuleView[];
}

export function AllianceDues({
  data,
  dues,
  busy,
  onOrder,
}: {
  data: AllianceForcesData;
  dues: AllianceDuesData;
  busy?: boolean;
  onOrder: (command: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useTranslation('allianceForces');
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [gold, setGold] = useState('0');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [kit, setKit] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [kind, setKind] = useState<string | null>('GOLD');
  const [role, setRole] = useState<string | null>(null);
  const [minLevel, setMinLevel] = useState<string | number>(1);
  const [interval, setInterval] = useState<string | number>(7);
  const [dueDays, setDueDays] = useState<string | number>(3);
  const [amount, setAmount] = useState('1000');
  const [troops, setTroops] = useState<string | number>(10);
  const [type, setType] = useState<string | null>('OFFENSE');
  const [level, setLevel] = useState<string | null>('1');
  const [confirmed, setConfirmed] = useState(false);
  const payment = dues.obligations.find((due) => due.id === paymentId);
  const unit = data.units.find((unit) => String(unit.id) === unitId);
  const slots = [
    ...new Set(
      data.catalog
        .filter((item) => item.usage === payment?.type)
        .map((item) => item.type),
    ),
  ];
  const count = Number(quantity);
  const equipment = slots.map((type) => ({ type, level: Number(kit[type]) }));
  const canPayTroops =
    payment &&
    payment.type &&
    unit &&
    unit.type === payment.type &&
    unit.level === payment.level &&
    Number.isInteger(count) &&
    count > 0 &&
    count <= unit.quantity &&
    count <= payment.quantity - payment.paidQuantity &&
    slots.every(
      (slot) =>
        kit[slot] &&
        data.items.some(
          (item) =>
            item.usage === payment.type &&
            item.type === slot &&
            item.level === Number(kit[slot]) &&
            item.quantity >= count,
        ),
    );
  const goldValue = /^\d{1,15}$/.test(gold) ? BigInt(gold) : 0n;
  const goldRemaining = payment
    ? BigInt(payment.amountGold) -
      BigInt(payment.paidGold) +
      BigInt(payment.fineGold) -
      BigInt(payment.paidFineGold)
    : 0n;
  const validTerms =
    kind === 'GOLD'
      ? /^[1-9]\d{0,14}$/.test(amount)
      : Number.isInteger(Number(troops)) && Number(troops) > 0;
  const terms = {
    amountGold: kind === 'GOLD' ? amount : '0',
    quantity: kind === 'TROOPS' ? Number(troops) : 0,
    type: kind === 'TROOPS' ? type : null,
    level: kind === 'TROOPS' ? Number(level) : null,
  };
  const outstanding = (due: ForceDueView) =>
    !due.cancelledAt &&
    (BigInt(due.amountGold) > BigInt(due.paidGold) ||
      due.quantity > due.paidQuantity ||
      BigInt(due.fineGold) > BigInt(due.paidFineGold));
  const overdue = dues.obligations.filter(
    (due) =>
      due.userId === data.userId &&
      outstanding(due) &&
      new Date(due.dueAt).getTime() < Date.now(),
  );
  return (
    <Stack gap="lg">
      <GameCard title={t('dues.title')}>
        <Stack>
          <Text>{t('dues.explanation')}</Text>
          {overdue.length > 0 && (
            <Alert color="yellow" role="status">
              {t('dues.overdueWarning', { count: overdue.length })}
            </Alert>
          )}
          <Text size="sm">
            {t('dues.enforcementWarning', {
              suspend: data.policy.enforcement.suspendOverdue
                ? t('dues.enabled')
                : t('dues.disabled'),
              collect:
                data.policy.enforcement.autoCollectAfterDays ??
                t('dues.disabled'),
              fine: data.policy.enforcement.fineGold,
              expel:
                data.policy.enforcement.expelAfterDays ?? t('dues.disabled'),
            })}
          </Text>
          {!dues.obligations.length ? (
            <Text c="var(--ot-muted)">{t('dues.empty')}</Text>
          ) : (
            <Table.ScrollContainer minWidth={750}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('borrower')}</Table.Th>
                    <Table.Th>{t('dues.obligation')}</Table.Th>
                    <Table.Th>{t('dues.remaining')}</Table.Th>
                    <Table.Th>{t('dues.due')}</Table.Th>
                    <Table.Th>{t('orders')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {dues.obligations.map((due) => (
                    <Table.Tr key={due.id}>
                      <Table.Td>
                        {data.members.find(
                          (member) => member.user_id === due.userId,
                        )?.user.display_name ?? due.userId}
                      </Table.Td>
                      <Table.Td>
                        {due.title}
                        <Text size="xs">
                          {t('dues.conditions', {
                            fine: due.enforcement?.fineGold ?? '0',
                            collect:
                              due.enforcement?.autoCollectAfterDays ??
                              t('dues.disabled'),
                            expel:
                              due.enforcement?.expelAfterDays ??
                              t('dues.disabled'),
                          })}
                        </Text>
                        {due.type && (
                          <Text size="xs">
                            {t(`roles.${due.type}`)} ·{' '}
                            {t('tier', { level: due.level })}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {due.type
                          ? t('dues.troopsRemaining', {
                              count: due.quantity - due.paidQuantity,
                            })
                          : t('dues.goldRemaining', {
                              gold: (
                                BigInt(due.amountGold) - BigInt(due.paidGold)
                              ).toString(),
                            })}
                        <Text size="xs">
                          {t('dues.fineRemaining', {
                            gold: (
                              BigInt(due.fineGold) - BigInt(due.paidFineGold)
                            ).toString(),
                          })}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <time dateTime={due.dueAt}>
                          {new Date(due.dueAt).toLocaleString()}
                        </time>
                        <Text size="xs">
                          {due.cancelledAt
                            ? t('dues.cancelled')
                            : !outstanding(due)
                              ? t('dues.paid')
                              : new Date(due.dueAt).getTime() < Date.now()
                                ? t('dues.overdue')
                                : t('dues.open')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group>
                          {due.userId === data.userId && outstanding(due) && (
                            <Button
                              size="xs"
                              onClick={() => {
                                setPaymentId(due.id);
                                setGold('0');
                                setKit({});
                                setUnitId(null);
                                setConfirmed(false);
                              }}
                            >
                              {t('dues.pay')}
                            </Button>
                          )}
                          {data.isLeader && outstanding(due) && (
                            <Button
                              size="xs"
                              variant="subtle"
                              loading={busy}
                              onClick={() =>
                                onOrder({
                                  action: 'waive',
                                  obligationId: due.id,
                                })
                              }
                            >
                              {t('dues.waive')}
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {payment && outstanding(payment) && (
            <Stack gap="sm">
              <Text fw={700}>
                {t('dues.paymentFor', { title: payment.title })}
              </Text>
              <TextInput
                label={t('dues.goldPayment')}
                value={gold}
                onChange={(event) => setGold(event.currentTarget.value)}
                inputMode="numeric"
              />
              <Button
                loading={busy}
                disabled={goldValue <= 0n || goldValue > goldRemaining}
                onClick={() =>
                  onOrder({
                    action: 'pay',
                    obligationId: payment.id,
                    amountGold: gold,
                    quantity: 0,
                  })
                }
              >
                {t('dues.payGold')}
              </Button>
              {payment.type && (
                <>
                  <Select
                    label={t('existingUnit')}
                    value={unitId}
                    onChange={setUnitId}
                    data={data.units
                      .filter(
                        (unit) =>
                          unit.type === payment.type &&
                          unit.level === payment.level,
                      )
                      .map((unit) => ({
                        value: String(unit.id),
                        label: `${t(`roles.${unit.type}`)} · ${unit.quantity}`,
                      }))}
                  />
                  <NumberInput
                    label={t('quantity')}
                    value={quantity}
                    onChange={setQuantity}
                    min={1}
                    max={payment.quantity - payment.paidQuantity}
                    allowDecimal={false}
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                    {slots.map((slot) => (
                      <Select
                        key={slot}
                        label={t(`slots.${slot}`)}
                        value={kit[slot] ?? null}
                        onChange={(value) =>
                          setKit((old) => ({ ...old, [slot]: value ?? '' }))
                        }
                        data={data.items
                          .filter(
                            (item) =>
                              item.usage === payment.type &&
                              item.type === slot &&
                              item.quantity >= count,
                          )
                          .map((item) => ({
                            value: String(item.level),
                            label:
                              data.catalog.find(
                                (entry) =>
                                  entry.usage === payment.type &&
                                  entry.type === slot &&
                                  entry.level === item.level,
                              )?.name ?? slot,
                          }))}
                      />
                    ))}
                  </SimpleGrid>
                  <Checkbox
                    checked={confirmed}
                    onChange={(event) =>
                      setConfirmed(event.currentTarget.checked)
                    }
                    label={t('confirmContribution')}
                  />
                  <Group>
                    <Button
                      loading={busy}
                      disabled={!confirmed || !canPayTroops}
                      onClick={() =>
                        onOrder({
                          action: 'pay',
                          obligationId: payment.id,
                          amountGold: '0',
                          quantity: count,
                          unitId: Number(unitId),
                          equipment,
                        })
                      }
                    >
                      {t('dues.payTroops')}
                    </Button>
                    <Button
                      variant="default"
                      loading={busy}
                      disabled={!canPayTroops}
                      onClick={() =>
                        onOrder({
                          action: 'designate',
                          obligationId: payment.id,
                          unitId: Number(unitId),
                          equipment,
                        })
                      }
                    >
                      {t('dues.designate')}
                    </Button>
                  </Group>
                  <Text size="xs">
                    {t('dues.designateExplanation', {
                      unit: payment.collectionUnitId ?? t('dues.none'),
                    })}
                  </Text>
                </>
              )}
              <Button variant="subtle" onClick={() => setPaymentId(null)}>
                {t('dues.close')}
              </Button>
            </Stack>
          )}
        </Stack>
      </GameCard>
      {data.isLeader && (
        <GameCard title={t('dues.leadership')}>
          <Stack>
            <Text>{t('dues.levyRules')}</Text>
            <Select
              label={t('dues.kind')}
              value={kind}
              onChange={setKind}
              data={[
                { value: 'GOLD', label: t('dues.gold') },
                { value: 'TROOPS', label: t('dues.troops') },
              ]}
              allowDeselect={false}
            />
            {kind === 'GOLD' ? (
              <TextInput
                label={t('dues.goldAmount')}
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                inputMode="numeric"
              />
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                <Select
                  label={t('unit')}
                  value={type}
                  onChange={setType}
                  allowDeselect={false}
                  data={['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].map(
                    (value) => ({ value, label: t(`roles.${value}`) }),
                  )}
                />
                <Select
                  label={t('dues.tier')}
                  value={level}
                  onChange={setLevel}
                  allowDeselect={false}
                  data={['1', '2', '3']}
                />
                <NumberInput
                  label={t('quantity')}
                  value={troops}
                  onChange={setTroops}
                  min={1}
                  max={1000000}
                  allowDecimal={false}
                />
              </SimpleGrid>
            )}
            <TextInput
              label={t('dues.levyTitle')}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={120}
            />
            <MultiSelect
              label={t('dues.recipients')}
              value={targets}
              onChange={setTargets}
              data={data.members.map((member) => ({
                value: String(member.user_id),
                label: member.user.display_name,
              }))}
            />
            <TextInput
              type="datetime-local"
              label={t('dues.due')}
              value={dueAt}
              onChange={(event) => setDueAt(event.currentTarget.value)}
            />
            <Button
              loading={busy}
              disabled={
                !validTerms ||
                !title.trim() ||
                !targets.length ||
                !dueAt ||
                !(new Date(dueAt).getTime() > Date.now())
              }
              onClick={() =>
                onOrder({
                  action: 'levy',
                  title,
                  userIds: targets.map(Number),
                  dueAt: new Date(dueAt).toISOString(),
                  terms,
                })
              }
            >
              {t('dues.issue')}
            </Button>
            <Text fw={700}>{t('dues.recurring')}</Text>
            <Text size="sm">{t('dues.levelRule')}</Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              <Select
                label={t('role')}
                value={role}
                onChange={setRole}
                data={data.roles.map((role) => ({
                  value: String(role.id),
                  label: role.name,
                }))}
              />
              <NumberInput
                label={t('dues.minimumLevel')}
                value={minLevel}
                onChange={setMinLevel}
                min={1}
                max={10000}
                allowDecimal={false}
              />
              <NumberInput
                label={t('dues.everyDays')}
                value={interval}
                onChange={setInterval}
                min={1}
                max={365}
                allowDecimal={false}
              />
              <NumberInput
                label={t('dues.dueDays')}
                value={dueDays}
                onChange={setDueDays}
                min={1}
                max={30}
                allowDecimal={false}
              />
            </SimpleGrid>
            <Button
              loading={busy}
              disabled={!validTerms || !role}
              onClick={() =>
                onOrder({
                  action: 'rule',
                  roleId: Number(role),
                  minLevel: Number(minLevel),
                  intervalDays: Number(interval),
                  dueDays: Number(dueDays),
                  enabled: true,
                  terms,
                })
              }
            >
              {t('dues.saveRule')}
            </Button>
            {dues.rules.map((rule) => (
              <Group key={rule.id} justify="space-between">
                <Text size="sm">
                  {data.roles.find((role) => role.id === rule.roleId)?.name} ·{' '}
                  {t('dues.ruleSummary', {
                    level: rule.minLevel,
                    interval: rule.intervalDays,
                    due: rule.dueDays,
                  })}{' '}
                  ·{' '}
                  {rule.type
                    ? `${rule.quantity} ${t(`roles.${rule.type}`)} (${rule.level})`
                    : `${rule.amountGold} ${t('dues.gold')}`}
                </Text>
                <Button
                  size="xs"
                  variant="default"
                  loading={busy}
                  onClick={() =>
                    onOrder({
                      action: 'rule',
                      roleId: rule.roleId,
                      minLevel: rule.minLevel,
                      terms: {
                        amountGold: rule.amountGold,
                        quantity: rule.quantity,
                        type: rule.type,
                        level: rule.level,
                      },
                      intervalDays: rule.intervalDays,
                      dueDays: rule.dueDays,
                      enabled: !rule.enabled,
                    })
                  }
                >
                  {rule.enabled ? t('dues.disable') : t('dues.enable')}
                </Button>
              </Group>
            ))}
          </Stack>
        </GameCard>
      )}
    </Stack>
  );
}
