import { expect, test, vi } from 'bun:test';
import type Stripe from 'stripe';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

import { syncProducts } from './stripe-sync-products';

installMockPrisma(vi);
mockPrisma.supporterPlanPrice.updateMany = vi.fn();

test('creates, preserves and transfers prices', async () => {
  const products: {
    id: string;
    active: boolean;
    metadata: { ot_plan_id: string };
  }[] = [];
  const prices: {
    id: string;
    active: boolean;
    lookup_key: string | null;
    product: string;
    unit_amount: number | null;
    currency: string;
    recurring: { interval: string } | null;
  }[] = [];
  let portal = false;
  const fake = {
    products: {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield* products.filter((p) => p.active);
        },
      }),
      create: async ({ metadata }: { metadata: { ot_plan_id: string } }) => {
        const p = { id: `prod_${products.length}`, active: true, metadata };
        products.push(p);
        return p;
      },
    },
    prices: {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: prices.filter((p) => p.active && p.lookup_key === lookup_keys[0]),
      }),
      create: async (input: {
        product: string;
        currency: string;
        unit_amount: number;
        lookup_key: string;
        recurring?: { interval: string };
        transfer_lookup_key?: boolean;
      }) => {
        if (input.transfer_lookup_key)
          prices
            .filter((p) => p.lookup_key === input.lookup_key)
            .forEach((p) => {
              p.lookup_key = null;
            });
        const p = {
          id: `price_${prices.length}`,
          active: true,
          lookup_key: input.lookup_key,
          product: input.product,
          unit_amount: input.unit_amount,
          currency: input.currency,
          recurring: input.recurring ?? null,
        };
        prices.push(p);
        return p;
      },
      update: async (id: string) => {
        const p = prices.find((price) => price.id === id)!;
        p.active = false;
        return p;
      },
    },
    billingPortal: {
      configurations: {
        list: async () => ({
          data: portal ? [{ id: 'bpc_1', is_default: true }] : [],
        }),
        create: async () => {
          portal = true;
          return { id: 'bpc_1', is_default: true };
        },
      },
    },
  } as unknown as Stripe;
  expect(
    (await syncProducts(fake)).filter((line) => line.includes('created')),
  ).toHaveLength(5);
  expect(
    (await syncProducts(fake)).filter((line) => line.includes('unchanged')),
  ).toHaveLength(5);
  prices[0].unit_amount = 1;
  expect((await syncProducts(fake))[0]).toContain('updated');
  expect(prices[0].active).toBe(false);
  expect(prices[5].lookup_key).toBe('ot_supporter_monthly');
});
