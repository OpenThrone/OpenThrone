import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import type { ForcePolicySchema } from '@/utils/temporaryForces';

export interface AllianceForcesData {
  allianceId: number;
  allianceName: string;
  userId: number;
  isLeader: boolean;
  reserves: Array<{
    id: number;
    type: string;
    level: number;
    available: number;
    woundedQuantity: number;
    equipment: Array<{ type: string; level: number }>;
  }>;
  contracts: Array<{
    id: number;
    userId: number;
    type: string;
    level: number;
    status: string;
    survivingQuantity: number;
    expiresAt: string | null;
    requestedExtensionDays: number | null;
    pillageRateBps: number;
    user: { display_name: string };
  }>;
  units: Array<{ id: number; type: string; level: number; quantity: number }>;
  items: Array<{
    usage: string;
    type: string;
    level: number;
    quantity: number;
  }>;
  catalog: Array<{ usage: string; type: string; level: number; name: string }>;
  members: Array<{ user_id: number; user: { display_name: string } }>;
  roles: Array<{ id: number; name: string }>;
  policy: ReturnType<typeof ForcePolicySchema.parse>;
}

export function AllianceForces({
  data,
  busy,
  error,
  onOrder,
}: {
  data: AllianceForcesData;
  busy?: boolean;
  error?: string;
  onOrder: (command: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useTranslation('allianceForces');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>(1);
  const [days, setDays] = useState<number | string>(3);
  const [kit, setKit] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [policy, setPolicy] = useState(data.policy);
  const unit = data.units.find((unit) => String(unit.id) === unitId);
  const slots = [
    ...new Set(
      data.catalog
        .filter((item) => item.usage === unit?.type)
        .map((item) => item.type),
    ),
  ];
  const count = Number(quantity);
  const term = Number(days);
  const complete =
    unit &&
    slots.length > 0 &&
    slots.every(
      (slot) =>
        kit[slot] &&
        data.items.some(
          (item) =>
            item.usage === unit.type &&
            item.type === slot &&
            item.level === Number(kit[slot]) &&
            item.quantity >= count,
        ),
    );
  const validCount = Number.isInteger(count) && count > 0 && count <= 1000000;
  const validTerm = Number.isInteger(term) && term >= 1 && term <= 30;
  const updateRole = (id: number, field: string, value: number | string) =>
    setPolicy((previous) => {
      const allowance = previous.roleAllowances.find(
        (role) => role.roleId === id,
      ) ?? {
        roleId: id,
        maxBorrowed: 0,
        maxTermDays: 7,
        pillageRateBps: 0,
        loanRateBps: 0,
      };
      return {
        ...previous,
        roleAllowances: [
          ...previous.roleAllowances.filter((role) => role.roleId !== id),
          { ...allowance, [field]: Number(value) || 0 },
        ],
      };
    });
  return (
    <Stack gap="lg">
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <GameCard title={t('pool')}>
        <Text mb="md">{t('rules')}</Text>
        <Group align="end" mb="md">
          <NumberInput
            label={t('quantity')}
            value={quantity}
            onChange={setQuantity}
            min={1}
            max={1000000}
            allowDecimal={false}
          />
          <NumberInput
            label={t('days')}
            value={days}
            onChange={setDays}
            min={1}
            max={30}
            allowDecimal={false}
          />
        </Group>
        {!data.reserves.length ? (
          <Text c="var(--ot-muted)">{t('emptyPool')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={650}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('unit')}</Table.Th>
                  <Table.Th>{t('equipment')}</Table.Th>
                  <Table.Th>{t('available')}</Table.Th>
                  <Table.Th>{t('wounded')}</Table.Th>
                  <Table.Th>{t('orders')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.reserves.map((reserve) => (
                  <Table.Tr key={reserve.id}>
                    <Table.Td>
                      {t(`roles.${reserve.type}`)} ·{' '}
                      {t('tier', { level: reserve.level })}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {reserve.equipment
                          .map(
                            (item) =>
                              data.catalog.find(
                                (entry) =>
                                  entry.usage === reserve.type &&
                                  entry.type === item.type &&
                                  entry.level === item.level,
                              )?.name ?? item.type,
                          )
                          .join(', ')}
                      </Text>
                    </Table.Td>
                    <Table.Td>{reserve.available}</Table.Td>
                    <Table.Td>{reserve.woundedQuantity}</Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        loading={busy}
                        disabled={
                          !validCount || !validTerm || reserve.available < count
                        }
                        onClick={() =>
                          onOrder({
                            action: 'request',
                            reserveId: reserve.id,
                            quantity: count,
                            termDays: term,
                          })
                        }
                      >
                        {data.policy.lendingMode === 'ROLE_ALLOWANCE'
                          ? t('borrow')
                          : t('request')}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </GameCard>
      <GameCard title={t('contribute')}>
        <Stack>
          <Text>{t('permanentWarning')}</Text>
          <Select
            label={t('existingUnit')}
            value={unitId}
            onChange={(value) => {
              setUnitId(value);
              setKit({});
              setConfirmed(false);
            }}
            data={data.units.map((unit) => ({
              value: String(unit.id),
              label: `${t(`roles.${unit.type}`)} · ${t('tier', { level: unit.level })} · ${unit.quantity}`,
            }))}
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
                      item.usage === unit?.type &&
                      item.type === slot &&
                      item.quantity >= count,
                  )
                  .map((item) => ({
                    value: String(item.level),
                    label: `${data.catalog.find((entry) => entry.usage === item.usage && entry.type === item.type && entry.level === item.level)?.name ?? slot} (${item.quantity})`,
                  }))}
              />
            ))}
          </SimpleGrid>
          <Checkbox
            label={t('confirmContribution')}
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <Button
            loading={busy}
            disabled={
              !confirmed ||
              !complete ||
              !validCount ||
              !unit ||
              unit.quantity < count
            }
            onClick={() =>
              unit &&
              onOrder({
                action: 'contribute',
                unitId: unit.id,
                quantity: count,
                equipment: slots.map((type) => ({
                  type,
                  level: Number(kit[type]),
                })),
              })
            }
          >
            {t('contributeCount', { count })}
          </Button>
        </Stack>
      </GameCard>
      <GameCard title={t('loans')}>
        {!data.contracts.length ? (
          <Text c="var(--ot-muted)">{t('emptyLoans')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('borrower')}</Table.Th>
                  <Table.Th>{t('unit')}</Table.Th>
                  <Table.Th>{t('survivors')}</Table.Th>
                  <Table.Th>{t('status')}</Table.Th>
                  <Table.Th>{t('orders')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.contracts.map((contract) => (
                  <Table.Tr key={contract.id}>
                    <Table.Td>{contract.user.display_name}</Table.Td>
                    <Table.Td>
                      {t(`roles.${contract.type}`)} ·{' '}
                      {t('tier', { level: contract.level })}
                      <Text size="xs">
                        {t('pillageRate', {
                          rate: contract.pillageRateBps / 100,
                        })}
                      </Text>
                    </Table.Td>
                    <Table.Td>{contract.survivingQuantity}</Table.Td>
                    <Table.Td>
                      <Badge variant="light">
                        {t(`statuses.${contract.status}`)}
                      </Badge>
                      {contract.expiresAt && (
                        <Text size="xs">
                          <time dateTime={contract.expiresAt}>
                            {new Date(contract.expiresAt).toLocaleString()}
                          </time>
                        </Text>
                      )}
                      {contract.requestedExtensionDays && (
                        <Text size="xs">
                          {t('extensionPending', {
                            days: contract.requestedExtensionDays,
                          })}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {contract.status === 'REQUESTED' &&
                          (data.isLeader ||
                            contract.userId === data.userId) && (
                            <Button
                              size="xs"
                              variant="subtle"
                              loading={busy}
                              onClick={() =>
                                onOrder({
                                  action: 'cancel',
                                  contractId: contract.id,
                                })
                              }
                            >
                              {t('cancelRequest')}
                            </Button>
                          )}
                        {data.isLeader && contract.status === 'REQUESTED' && (
                          <Button
                            size="xs"
                            loading={busy}
                            onClick={() =>
                              onOrder({
                                action: 'approve',
                                contractId: contract.id,
                              })
                            }
                          >
                            {t('approve')}
                          </Button>
                        )}
                        {contract.status === 'ACTIVE' &&
                          contract.userId === data.userId && (
                            <>
                              <Button
                                size="xs"
                                variant="default"
                                loading={busy}
                                disabled={!validTerm}
                                onClick={() =>
                                  onOrder({
                                    action: 'extend',
                                    contractId: contract.id,
                                    days: term,
                                  })
                                }
                              >
                                {t('extend', { days: term })}
                              </Button>
                              <Button
                                size="xs"
                                variant="subtle"
                                loading={busy}
                                onClick={() =>
                                  onOrder({
                                    action: 'return',
                                    contractId: contract.id,
                                  })
                                }
                              >
                                {t('return')}
                              </Button>
                            </>
                          )}
                        {data.isLeader && contract.status === 'ACTIVE' && (
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            loading={busy}
                            onClick={() =>
                              onOrder({
                                action: 'recall',
                                contractId: contract.id,
                              })
                            }
                          >
                            {t('recall')}
                          </Button>
                        )}
                        {data.isLeader && contract.requestedExtensionDays && (
                          <Button
                            size="xs"
                            loading={busy}
                            onClick={() =>
                              onOrder({
                                action: 'approveExtension',
                                contractId: contract.id,
                                days: contract.requestedExtensionDays,
                              })
                            }
                          >
                            {t('approveExtension')}
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
      </GameCard>
      {data.isLeader && (
        <GameCard title={t('settings')}>
          <Stack>
            <Select
              label={t('approval')}
              value={policy.lendingMode}
              onChange={(value) =>
                value &&
                setPolicy({
                  ...policy,
                  lendingMode: value as 'MANUAL' | 'ROLE_ALLOWANCE',
                })
              }
              data={[
                { value: 'MANUAL', label: t('manual') },
                { value: 'ROLE_ALLOWANCE', label: t('automatic') },
              ]}
              allowDeselect={false}
            />
            <Text size="sm">{t('taxRule')}</Text>
            <Table.ScrollContainer minWidth={700}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('role')}</Table.Th>
                    <Table.Th>{t('allowance')}</Table.Th>
                    <Table.Th>{t('maxDays')}</Table.Th>
                    <Table.Th>{t('generalTax')}</Table.Th>
                    <Table.Th>{t('loanTax')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.roles.map((role) => {
                    const allowance = policy.roleAllowances.find(
                      (entry) => entry.roleId === role.id,
                    );
                    return (
                      <Table.Tr key={role.id}>
                        <Table.Td>{role.name}</Table.Td>
                        {(
                          [
                            'maxBorrowed',
                            'maxTermDays',
                            'pillageRateBps',
                            'loanRateBps',
                          ] as const
                        ).map((field) => (
                          <Table.Td key={field}>
                            <NumberInput
                              aria-label={`${role.name} ${t(field)}`}
                              value={
                                allowance?.[field] ??
                                (field === 'maxTermDays' ? 7 : 0)
                              }
                              min={field === 'maxTermDays' ? 1 : 0}
                              max={
                                field.endsWith('Bps')
                                  ? 2500
                                  : field === 'maxTermDays'
                                    ? 30
                                    : 1000000
                              }
                              allowDecimal={false}
                              onChange={(value) =>
                                updateRole(role.id, field, value)
                              }
                            />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Text size="xs">{t('basisPoints')}</Text>
            <Checkbox
              label={t('dues.suspend')}
              checked={policy.enforcement.suspendOverdue}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  enforcement: {
                    ...policy.enforcement,
                    suspendOverdue: event.currentTarget.checked,
                  },
                })
              }
            />
            <Checkbox
              label={t('dues.autoCollect')}
              checked={policy.enforcement.autoCollectAfterDays !== null}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  enforcement: {
                    ...policy.enforcement,
                    autoCollectAfterDays: event.currentTarget.checked
                      ? 3
                      : null,
                    ...(event.currentTarget.checked
                      ? {}
                      : { fineGold: '0', expelAfterDays: null }),
                  },
                })
              }
            />
            {policy.enforcement.autoCollectAfterDays !== null && (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                <NumberInput
                  label={t('dues.collectAfter')}
                  value={policy.enforcement.autoCollectAfterDays}
                  min={1}
                  max={365}
                  allowDecimal={false}
                  onChange={(value) =>
                    setPolicy({
                      ...policy,
                      enforcement: {
                        ...policy.enforcement,
                        autoCollectAfterDays: Number(value) || 1,
                      },
                    })
                  }
                />
                <NumberInput
                  label={t('dues.fine')}
                  value={Number(policy.enforcement.fineGold)}
                  min={0}
                  max={99999999999999}
                  allowDecimal={false}
                  onChange={(value) =>
                    setPolicy({
                      ...policy,
                      enforcement: {
                        ...policy.enforcement,
                        fineGold: String(value || 0),
                      },
                    })
                  }
                />
              </SimpleGrid>
            )}
            <Checkbox
              label={t('dues.expel')}
              disabled={policy.enforcement.autoCollectAfterDays === null}
              checked={policy.enforcement.expelAfterDays !== null}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  enforcement: {
                    ...policy.enforcement,
                    expelAfterDays: event.currentTarget.checked
                      ? (policy.enforcement.autoCollectAfterDays ?? 3) + 7
                      : null,
                  },
                })
              }
            />
            {policy.enforcement.expelAfterDays !== null && (
              <NumberInput
                label={t('dues.expelAfter')}
                min={(policy.enforcement.autoCollectAfterDays ?? 1) + 1}
                max={365}
                allowDecimal={false}
                value={policy.enforcement.expelAfterDays}
                onChange={(value) =>
                  setPolicy({
                    ...policy,
                    enforcement: {
                      ...policy.enforcement,
                      expelAfterDays: Number(value) || null,
                    },
                  })
                }
              />
            )}
            <Text size="sm">{t('dues.policyWarning')}</Text>
            <Button
              loading={busy}
              onClick={() => onOrder({ action: 'policy', settings: policy })}
            >
              {t('save')}
            </Button>
          </Stack>
        </GameCard>
      )}
    </Stack>
  );
}
