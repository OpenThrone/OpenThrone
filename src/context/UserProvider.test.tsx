import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import { UserProvider, useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';

const mockSignOut = jest.fn(async () => undefined);
const mockSession = {
  data: { user: { id: '7' } },
  status: 'authenticated',
  update: jest.fn(),
};

const mockRouter = { replace: jest.fn() };
jest.mock('next/navigation', () => ({
  usePathname: () => '/home/overview',
  useRouter: () => mockRouter,
}));
jest.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...(args as [])),
  useSession: () => mockSession,
}));
jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/hooks/useRuntimeConfig', () => ({
  useRuntimeConfig: () => ({ config: null }),
}));
jest.mock('@/hooks/useSocket', () => ({
  __esModule: true,
  default: () => ({
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }),
}));
jest.mock('@/models/Users', () => ({
  __esModule: true,
  default: class {
    displayName: string;

    constructor(user: { display_name: string }) {
      this.displayName = user.display_name;
    }
  },
}));
jest.mock('@/services/Alert.service', () => ({
  alertService: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('@/utils/userDataFetch', () => ({
  fetchUserDataWithRetry: (...args: unknown[]) => mockFetchUser(...args),
}));

const mockFetchUser = jest.fn();
const okResult = (name: string) => ({
  kind: 'ok',
  data: { id: 7, display_name: name },
});

let refresh: () => void;
function Probe() {
  const { user, forceUpdate } = useUser() as any;
  refresh = forceUpdate;
  return <p data-testid="name">{user?.displayName ?? 'signed-out shell'}</p>;
}

let container: HTMLDivElement;
let root: Root;
const shown = () => container.querySelector('[data-testid=name]')?.textContent;

async function mount() {
  await act(async () => {
    root.render(
      <UserProvider>
        <Probe />
      </UserProvider>,
    );
  });
}

describe('UserProvider through a failed refresh (#362)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it('keeps the loaded player when the server keeps failing', async () => {
    mockFetchUser.mockResolvedValueOnce(okResult('Rex'));
    await mount();
    expect(shown()).toBe('Rex');

    mockFetchUser.mockResolvedValueOnce({ kind: 'failed', error: 'down' });
    await act(async () => refresh());

    expect(shown()).toBe('Rex');
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(alertService.error).toHaveBeenCalledWith('errors.stillSignedIn');
  });

  it('signs out on a 401', async () => {
    mockFetchUser.mockResolvedValueOnce(okResult('Rex'));
    await mount();
    mockFetchUser.mockResolvedValueOnce({ kind: 'unauthorized' });
    await act(async () => refresh());

    expect(shown()).toBe('signed-out shell');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('has nobody to keep on a failed first load, and stays signed in', async () => {
    mockFetchUser.mockResolvedValueOnce({ kind: 'failed', error: 'down' });
    await mount();

    expect(shown()).toBe('signed-out shell');
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(alertService.error).toHaveBeenCalledWith('errors.stillSignedIn');
  });

  it('ignores an older request that finishes after a newer one', async () => {
    mockFetchUser.mockResolvedValueOnce(okResult('Rex'));
    await mount();

    let finishOlder: (value: unknown) => void = () => undefined;
    mockFetchUser.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOlder = resolve;
      }),
    );
    mockFetchUser.mockResolvedValueOnce(okResult('Newest'));
    await act(async () => {
      refresh();
      refresh();
    });
    expect(shown()).toBe('Newest');

    await act(async () => finishOlder({ kind: 'unauthorized' }));
    expect(shown()).toBe('Newest');
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
