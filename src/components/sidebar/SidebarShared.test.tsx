import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import UserModel from '@/models/Users';
import {
  getOTTime,
  getTimeRemaining,
  getTimeToNextTurn,
} from '@/utils/timefunctions';

import { SidebarTimeInfo } from './SidebarShared';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

let titleRenderCount = 0;

jest.mock('@mantine/core', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Title: ({ children }: { children: React.ReactNode }) => {
    titleRenderCount += 1;
    return <h2>{children}</h2>;
  },
}));

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/utils/timefunctions', () => ({
  getOTTime: jest.fn(),
  getTimeRemaining: jest.fn(),
  getTimeToNextTurn: jest.fn(),
}));

describe('SidebarTimeInfo', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    titleRenderCount = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    jest.mocked(getTimeToNextTurn).mockReturnValue('next turn');
    jest
      .mocked(getTimeRemaining)
      .mockReturnValueOnce({
        total: 60_000,
        days: 0,
        hours: 0,
        minutes: 1,
        seconds: 0,
      })
      .mockReturnValue({
        total: 59_000,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 59,
      });
    jest.mocked(getOTTime).mockReturnValue(new Date('2026-07-18T12:00:00'));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it('updates only the clock text when the one-second timer fires', () => {
    const user = new UserModel();

    act(() => {
      root.render(<SidebarTimeInfo user={user} userLoading={false} />);
    });
    const renderCountAfterInitialUpdate = titleRenderCount;

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(container.querySelector('#nextTurnTimestamp')?.textContent).toBe(
      '00:59',
    );
    expect(titleRenderCount).toBe(renderCountAfterInitialUpdate);
  });
});
