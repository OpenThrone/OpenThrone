import { MantineProvider } from '@mantine/core';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import BankDepositWithdraw from '@/components/BankDepositWithdraw';
import { alertService } from '@/services/Alert.service';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => key,
  }),
}));
jest.mock('@/hooks/useRuntimeConfig', () => ({
  useRuntimeConfig: () => ({ config: null }),
}));
jest.mock('@/services/Alert.service', () => ({
  alertService: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('@/utils/logger', () => ({ logError: jest.fn() }));
jest.mock('@/components/battle/QuantityInput', () => ({
  __esModule: true,
  default: ({ label, onChange }: any) => (
    <button
      type="button"
      data-amount={label}
      onClick={() => onChange(BigInt(10))}
    >
      set {label}
    </button>
  ),
}));

const historyReply = { json: async () => ({ rows: [] }) };
const user = { gold: 1000, goldInBank: 1000 };

let container: HTMLDivElement;
let root: Root;
let bankReply: () => Promise<unknown>;

async function submitDeposit() {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => {
    root.render(
      <MantineProvider>
        <BankDepositWithdraw user={user} forceUpdate={jest.fn()} />
      </MantineProvider>,
    );
  });
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-amount="bank.amount"]')
      ?.click();
  });
  const buttons = Array.from(container.querySelectorAll('button'));
  const deposit = buttons.find(
    (button) =>
      !button.dataset.amount && button.textContent?.includes('bank.deposit'),
  );
  await act(async () => {
    deposit?.click();
  });
}

describe('bank deposit failures (#352)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.fetch = jest.fn((url: string) =>
      String(url).includes('/history')
        ? Promise.resolve(historyReply)
        : bankReply(),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the readable message for an HTML gateway page', async () => {
    bankReply = async () => ({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });
    await submitDeposit();
    expect(alertService.error).toHaveBeenCalledWith('bank.unreachable');
  });

  it('shows the readable message when the request is rejected', async () => {
    bankReply = async () => {
      throw new TypeError('Failed to fetch');
    };
    await submitDeposit();
    expect(alertService.error).toHaveBeenCalledWith('bank.unreachable');
  });

  it('does not resend a request whose outcome is unknown', async () => {
    bankReply = async () => {
      throw new TypeError('Failed to fetch');
    };
    await submitDeposit();
    const posts = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => String(url) === '/api/bank/deposit',
    );
    expect(posts).toHaveLength(1);
  });

  it('still shows the server refusal in the player language', async () => {
    bankReply = async () => ({
      ok: false,
      json: async () => ({ error: 'Maximum deposits reached' }),
    });
    await submitDeposit();
    expect(alertService.error).toHaveBeenCalledWith('bank.noDepositsLeft');
  });
});
