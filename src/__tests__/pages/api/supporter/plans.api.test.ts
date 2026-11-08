import { describe, expect, it, vi } from 'bun:test';

vi.mock('@/services/RuntimeConfig.service', () => ({
  getRuntimeConfig: async () => ({ enableSupporter: true }),
}));
vi.mock('@/services/supporter/planPrices', () => ({
  getSupporterPlans: async () => ({
    supporter_monthly: {
      id: 'supporter_monthly',
      priceCents: 799,
      providerPriceId: 'price_internal',
    },
  }),
}));

const handler = require('@/pages/api/supporter/plans').default;

describe('public supporter plans', () => {
  it('lists current prices without provider price ids', async () => {
    const res: any = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    await handler({ method: 'GET' }, res);
    const plans = res.json.mock.calls[0][0];
    expect(plans).toEqual([{ id: 'supporter_monthly', priceCents: 799 }]);
  });
});
