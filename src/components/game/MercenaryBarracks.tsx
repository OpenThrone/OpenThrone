import {
  Alert,
  Badge,
  Button,
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

export interface MercenaryOffer {
  type: string;
  level: number;
  name: string;
  fortLevel: number;
  mobilization: string;
  dailyPrice: string;
}
export interface MercenaryContract {
  woundedQuantity?: number;
  id: number;
  type: string;
  level: number;
  survivingQuantity: number;
  initialQuantity: number;
  expiresAt: string;
  unitPriceGold: string;
}
export type MercenaryOrder =
  | {
      action: 'hire';
      type: string;
      level: number;
      quantity: number;
      termDays: number;
    }
  | { action: 'renew'; contractId: number; termDays: number }
  | { action: 'dismiss'; contractId: number };

/** The same barracks is used by the live page and the visual guide. */
export function MercenaryBarracks({
  offers,
  contracts,
  fortLevel,
  gold,
  busy,
  error,
  onOrder,
}: {
  offers: MercenaryOffer[];
  contracts: MercenaryContract[];
  fortLevel: number;
  gold: string;
  busy?: boolean;
  error?: string;
  onOrder: (order: MercenaryOrder) => Promise<void>;
}) {
  const { t } = useTranslation('mercenaries');
  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string | number>(1);
  const [days, setDays] = useState<string | null>('1');
  const [dismissId, setDismissId] = useState<number | null>(null);
  const offer = offers.find((o) => `${o.type}:${o.level}` === selected);
  const count = Number(quantity) || 0;
  const termDays = Number(days) || 1;
  const total = offer
    ? BigInt(Math.max(0, Math.floor(count))) *
      (BigInt(offer.mobilization) + BigInt(termDays) * BigInt(offer.dailyPrice))
    : 0n;
  const valid =
    offer &&
    Number.isInteger(count) &&
    count > 0 &&
    count <= 100 &&
    total <= BigInt(gold) &&
    fortLevel >= offer.fortLevel;
  return (
    <Stack gap="lg">
      <GameCard title={t('hireTitle')}>
        <Stack>
          <Text>{t('description')}</Text>
          <Text size="sm" c="var(--ot-muted)">
            {t('specialization')}
          </Text>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            <Select
              label={t('unit')}
              placeholder={t('choose')}
              value={selected}
              onChange={setSelected}
              data={offers.map((o) => ({
                value: `${o.type}:${o.level}`,
                label: `${t(`roles.${o.type}`)} · ${o.name} · ${t('tier', { level: o.level })}`,
                disabled: fortLevel < o.fortLevel,
              }))}
            />
            <NumberInput
              label={t('quantity')}
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={100}
              allowDecimal={false}
            />
            <Select
              label={t('term')}
              value={days}
              onChange={setDays}
              data={[1, 3, 7].map((value) => ({
                value: String(value),
                label: t('days', { count: value }),
              }))}
              allowDeselect={false}
            />
          </SimpleGrid>
          {offer && (
            <Text size="sm">
              {t('price', {
                mobilization: offer.mobilization,
                daily: offer.dailyPrice,
                total: total.toString(),
              })}
            </Text>
          )}
          <Group justify="space-between">
            <Text size="sm">{t('cap')}</Text>
            <Button
              disabled={!valid}
              loading={busy}
              onClick={() =>
                offer &&
                onOrder({
                  action: 'hire',
                  type: offer.type,
                  level: offer.level,
                  quantity: count,
                  termDays,
                })
              }
            >
              {t('hire', { total: total.toString() })}
            </Button>
          </Group>
        </Stack>
      </GameCard>
      <GameCard title={t('contractsTitle')}>
        <Text size="sm" mb="md">
          {t('expiryRule')}
        </Text>
        {contracts.length === 0 ? (
          <Text c="var(--ot-muted)">{t('empty')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={680}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('unit')}</Table.Th>
                  <Table.Th>{t('survivors')}</Table.Th>
                  <Table.Th>{t('expires')}</Table.Th>
                  <Table.Th>{t('orders')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {contracts.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      {t(`roles.${c.type}`)}{' '}
                      <Badge variant="light">
                        {t('tier', { level: c.level })}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {c.survivingQuantity} / {c.initialQuantity}
                      <Text size="xs">
                        {t('recovering', { count: c.woundedQuantity ?? 0 })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <time dateTime={c.expiresAt}>
                        {new Date(c.expiresAt).toLocaleString()}
                      </time>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="default"
                          loading={busy}
                          disabled={
                            BigInt(c.unitPriceGold) *
                              BigInt(c.survivingQuantity) *
                              BigInt(termDays) >
                            BigInt(gold)
                          }
                          onClick={() =>
                            onOrder({
                              action: 'renew',
                              contractId: c.id,
                              termDays,
                            })
                          }
                        >
                          {t('renew', {
                            days: termDays,
                            gold: (
                              BigInt(c.unitPriceGold) *
                              BigInt(c.survivingQuantity) *
                              BigInt(termDays)
                            ).toString(),
                          })}
                        </Button>
                        <Button
                          size="xs"
                          color="red"
                          variant="subtle"
                          disabled={busy}
                          onClick={() => setDismissId(c.id)}
                        >
                          {t('dismiss')}
                        </Button>
                      </Group>
                      {dismissId === c.id && (
                        <Stack gap="xs" mt="xs">
                          <Text size="sm">{t('dismissWarning')}</Text>
                          <Group>
                            <Button
                              size="xs"
                              color="red"
                              loading={busy}
                              onClick={async () => {
                                await onOrder({
                                  action: 'dismiss',
                                  contractId: c.id,
                                });
                                setDismissId(null);
                              }}
                            >
                              {t('confirmDismiss')}
                            </Button>
                            <Button
                              size="xs"
                              variant="default"
                              onClick={() => setDismissId(null)}
                            >
                              {t('cancel')}
                            </Button>
                          </Group>
                        </Stack>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </GameCard>
    </Stack>
  );
}
