import type { Session } from 'next-auth';
import React from 'react';
import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import { AppWithTheme } from '../pages/_app';

const ACTIVE_SESSION: Session = {
  expires: '2099-01-01T00:00:00.000Z',
  user: { name: 'Test player' },
};

type RuntimeSessionState = {
  data: Session | null;
  status: 'authenticated' | 'loading' | 'unauthenticated';
  update: jest.Mock;
};

let mockSessionState: RuntimeSessionState = {
  data: ACTIVE_SESSION,
  status: 'loading',
  update: jest.fn(),
};

jest.mock('@mantine/core', () => ({
  MantineProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@mantine/hooks', () => ({
  useLocalStorage: ({ defaultValue }: { defaultValue: string }) => [
    defaultValue,
    jest.fn(),
  ],
}));

jest.mock('next-auth/react', () => ({
  SessionProvider: jest.fn(),
  useSession: () => mockSessionState,
}));

jest.mock('next-i18next', () => ({
  appWithTranslation: (component: React.ComponentType) => component,
  useTranslation: () => ({
    i18n: { language: 'en', loadNamespaces: jest.fn() },
    t: (key: string) => key,
  }),
}));

jest.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/home/overview',
    events: { off: jest.fn(), on: jest.fn() },
    isReady: true,
    pathname: '/home/overview',
  }),
}));

jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'app-layout' }, children),
}));

jest.mock('@/context/LayoutContext', () => ({
  LayoutProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/context/users', () => ({
  useUser: () => ({ user: null }),
}));

jest.mock('@/styles/themes', () => ({
  themes: { ELF: {} },
}));

describe('authenticated app shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockSessionState = {
      data: ACTIVE_SESSION,
      status: 'loading',
      update: jest.fn(),
    };
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it('keeps the page mounted while an existing session refreshes', () => {
    const Page = () => <div>Persistent page state</div>;
    mockSessionState = {
      data: ACTIVE_SESSION,
      status: 'authenticated',
      update: jest.fn(),
    };

    flushSync(() => {
      root.render(<AppWithTheme Component={Page} pageProps={{}} />);
    });
    const mountedPage = container.querySelector('[data-testid="app-layout"]');

    mockSessionState = {
      data: ACTIVE_SESSION,
      status: 'loading',
      update: jest.fn(),
    };
    flushSync(() => {
      root.render(<AppWithTheme Component={Page} pageProps={{}} />);
    });

    expect(container.querySelector('[data-testid="app-layout"]')).toBe(
      mountedPage,
    );
    expect(container.textContent).toContain('Persistent page state');
    expect(
      container.querySelector('[data-testid="session-loader"]'),
    ).toBeNull();
  });

  it('keeps the page shell mounted during the initial session lookup', () => {
    const Page = () => <div>Private page</div>;

    mockSessionState = {
      data: null,
      status: 'loading',
      update: jest.fn(),
    };
    flushSync(() => {
      root.render(<AppWithTheme Component={Page} pageProps={{}} />);
    });

    expect(
      container.querySelector('[data-testid="app-layout"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Private page');
  });
});
