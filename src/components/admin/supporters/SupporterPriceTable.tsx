import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { PlayerButton } from '@/components/admin/supporters/SupporterAdminParts';
import { GameCard } from '@/components/game/GameCard';
import { money } from '@/components/supporter/SupporterParts';
import type { AdminSupporterPlan } from '@/types/supporter';

export default function SupporterPriceTable({
  plans,
  onSave,
  onPlayer,
}: {
  onPlayer?: (id: number) => void;
  plans: AdminSupporterPlan[];
  onSave: (plan: AdminSupporterPlan, cents: number) => Promise<void> | void;
}) {
  const { t } = useTranslation('admin-supporters');
  const { t: supporterT } = useTranslation('supporter');
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [pending, setPending] = useState<{
    plan: AdminSupporterPlan;
    cents: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async () => {
    if (!pending || busy) return;
    setBusy(true);
    const { plan, cents } = pending;
    try {
      await onSave(plan, cents);
      setValues((old) => {
        const next = { ...old };
        delete next[plan.id];
        return next;
      });
      setErrors((old) => ({ ...old, [plan.id]: '' }));
      setPending(null);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'price_save_failed';
      setErrors((old) => ({
        ...old,
        [plan.id]: t(
          [
            'invalid_price',
            'price_conflict',
            'stripe_price_failed',
            'price_save_failed',
          ].includes(key)
            ? key
            : 'price_save_failed',
        ),
      }));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <GameCard title={t('plans')}>
      <Stack>
        <Text size="sm">{t('newPurchasesOnly')}</Text>
        <AdminDataTable ariaLabel={t('plans')} size="wide">
          <Table.Thead>
            <Table.Tr>
              {[
                'plan',
                'type',
                'grant',
                'currentPrice',
                'lastChanged',
                'newPrice',
                'actions',
              ].map((key) => (
                <Table.Th key={key}>{t(key)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {plans.map((plan) => {
              const value = values[plan.id] ?? plan.priceCents / 100;
              const cents = Math.round(Number(value) * 100);
              const valid =
                value !== '' &&
                Number.isFinite(Number(value)) &&
                cents >= 100 &&
                cents <= 100000 &&
                Math.abs(Number(value) * 100 - cents) < 0.000001;
              return (
                <Table.Tr key={plan.id}>
                  <Table.Td>{supporterT(`plans.${plan.id}`)}</Table.Td>
                  <Table.Td>{t(`labels.${plan.kind}`)}</Table.Td>
                  <Table.Td>
                    {plan.grantDays
                      ? t('grantDays', { count: plan.grantDays })
                      : plan.grantMonths
                        ? t('grantMonths', { count: plan.grantMonths })
                        : t('monthlyGrant')}
                  </Table.Td>
                  <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money(plan.priceCents, plan.currency)}
                  </Table.Td>
                  <Table.Td>
                    {plan.updatedAt ? (
                      <>
                        {plan.updatedById && plan.updatedByName ? (
                          <PlayerButton
                            userId={plan.updatedById}
                            name={plan.updatedByName}
                            onPlayer={onPlayer}
                          />
                        ) : (
                          t('unknownAdmin')
                        )}
                        <Text size="xs">
                          {new Date(plan.updatedAt).toLocaleString()}
                        </Text>
                      </>
                    ) : (
                      t('defaultPrice')
                    )}
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label={t('newPriceFor', {
                        plan: supporterT(`plans.${plan.id}`),
                      })}
                      prefix="$"
                      suffix=" USD"
                      min={1}
                      max={1000}
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      value={value}
                      disabled={busy}
                      onChange={(next) =>
                        setValues((old) => ({ ...old, [plan.id]: next }))
                      }
                      styles={{ root: { minWidth: 140 } }}
                    />
                    {errors[plan.id] && (
                      <Text c="red" size="sm" role="alert">
                        {errors[plan.id]}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      disabled={busy || !valid || cents === plan.priceCents}
                      loading={busy && pending?.plan.id === plan.id}
                      onClick={() => setPending({ plan, cents })}
                    >
                      {t('savePrice')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </AdminDataTable>
      </Stack>
      <Modal
        opened={pending !== null}
        onClose={() => {
          if (!busy) setPending(null);
        }}
        title={t('confirmPrice')}
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <Text>{t('newPurchasesOnly')}</Text>
          {pending && (
            <Text>
              {supporterT(`plans.${pending.plan.id}`)}:{' '}
              {money(pending.plan.priceCents)} → {money(pending.cents)}
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              {t('cancel')}
            </Button>
            <Button loading={busy} onClick={save}>
              {t('savePrice')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </GameCard>
  );
}
