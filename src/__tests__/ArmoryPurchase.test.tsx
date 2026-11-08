import { MantineProvider } from '@mantine/core';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import ArmoryTab from '@/pages/structures/armory/[tab]';
import { alertService } from '@/services/Alert.service';

const ITEM = {
  id: 1,
  name: 'Dagger',
  usage: 'OFFENSE',
  type: 'WEAPON',
  level: 1,
  cost: 100,
  armoryLevel: 1,
  race: 'ALL',
  bonus: 10,
};
const mockUser = {
  id: 7,
  race: 'HUMAN',
  gold: 10000,
  armoryLevel: 1,
  priceBonus: 0,
  items: [],
  units: [],
  availableItemTypes: [ITEM],
};

jest.mock('next/router', () => ({
  useRouter: () => ({ query: { tab: 'offense' }, push: jest.fn() }),
}));
jest.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
jest.mock('@/context/users', () => ({
  useUser: () => ({ user: mockUser, forceUpdate: jest.fn() }),
}));
jest.mock('@/hooks/useActiveGameEvents', () => ({
  useActiveGameEvents: () => ({
    modifiers: { armoryCostDiscountPercent: 0 },
  }),
}));
jest.mock('@/services/Alert.service', () => ({
  alertService: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('@/components/MainArea', () => ({
  __esModule: true,
  default: ({ children }: any) => <main>{children}</main>,
}));
jest.mock('@/components/game/ArmoryLoadoutPlanner', () => ({
  ArmoryLoadoutPlanner: () => null,
}));
jest.mock('@/components/game/StatGrid', () => ({ StatGrid: () => null }));
jest.mock('@/components/game/TabBar', () => ({ TabBar: () => null }));
jest.mock('@/components/game/PageLoading', () => ({ PageLoading: () => null }));
jest.mock('@/components/newItemSection', () => ({
  __esModule: true,
  default: ({ items, setItemCosts }: any) => (
    <button
      type="button"
      data-testid="pick"
      onClick={() => setItemCosts({ [items[0].id]: 2 })}
    >
      pick
    </button>
  ),
}));
jest.mock('@/components/game/OrderSummaryBar', () => ({
  OrderSummaryBar: ({ primaryAction }: any) => (
    <button type="button" data-testid="buy" onClick={primaryAction.onClick}>
      buy
    </button>
  ),
}));

let container: HTMLDivElement;
let root: Root;

async function buy() {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => {
    root.render(
      <MantineProvider>
        <ArmoryTab />
      </MantineProvider>,
    );
  });
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid=pick]')?.click();
  });
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid=buy]')?.click();
  });
}

describe('armory purchase toast (#361)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it('names the quantity, item and unit role, not the server text', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ message: 'Items equipped' }),
    })) as unknown as typeof fetch;
    await buy();

    const message = (alertService.success as jest.Mock).mock.calls[0]?.[0];
    expect(message).toContain('armory.purchaseSuccess');
    expect(message).toContain('Dagger');
    expect(message).toContain('armory.unitRoles.offense_other');
    expect(message).not.toContain('Items equipped');
  });

  it('shows the server error when the purchase is refused', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Not enough gold' }),
    })) as unknown as typeof fetch;
    await buy();

    expect(alertService.success).not.toHaveBeenCalled();
    expect(alertService.error).toHaveBeenCalledWith('Not enough gold');
  });
});
