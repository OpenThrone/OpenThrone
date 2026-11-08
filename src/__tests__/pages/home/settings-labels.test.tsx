import { MantineProvider } from '@mantine/core';
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import SettingsPage from '@/pages/home/settings';
import { themes } from '@/styles/themes';

// Static render only; effects (API calls, router pushes) never run.
mock.module('next/router', () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    query: {},
    pathname: '/home/settings',
    events: { on: () => undefined, off: () => undefined },
  }),
}));
mock.module('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signOut: () => undefined,
  getSession: () => Promise.resolve(null),
}));

const fakeUser = {
  id: 2,
  colorScheme: 'HUMAN',
  locale: 'en-US',
  email: 'dev-raider@openthrone.local',
  twoFactorEnabled: false,
};

mock.module('@/context/users', () => ({
  useUser: () => ({
    user: fakeUser,
    forceUpdate: () => undefined,
    loading: false,
    unreadMessages: [],
    unreadMessagesCount: 0,
    markMessagesAsRead: () => undefined,
    markRoomAsRead: () => undefined,
  }),
  UserProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Without an i18n provider the keys render verbatim; the label wiring is
// what this test verifies, not the translations.
describe('settings game-options selector labels (issue #12)', () => {
  it('ties every select input to a <label for> (locale and colour scheme)', () => {
    const html = renderToStaticMarkup(
      <MantineProvider theme={themes.HUMAN}>
        <SettingsPage />
      </MantineProvider>,
    );

    // The full page rendered (not the no-user loading shell).
    expect(html).toContain('settings.gameOptions');
    expect(html).toContain('settings.localeFormatting');
    expect(html).toContain('settings.colorScheme');

    const selects = [
      ...html.matchAll(
        /<input[^>]*class="[^"]*mantine-Select-input[^"]*"[^>]*>/g,
      ),
    ];
    expect(selects.length).toBeGreaterThanOrEqual(3);

    const labelFors = [
      ...html.matchAll(/<label[^>]*\bfor="([^"]+)"[^>]*>/g),
    ].map((m) => m[1]);

    for (const select of selects) {
      // \b so aria-invalid="false" is not read as id="false".
      const id = select[0].match(/\bid="([^"]+)"/)?.[1];
      expect(id).toBeTruthy();
      expect(labelFors).toContain(id);
    }

    // The two selectors this fix labelled carry their heading keys as the
    // label text, tied to their inputs.
    const localeLabel = html.match(
      /<label[^>]*for="([^"]+)"[^>]*>settings\.localeFormatting<\/label>/,
    );
    const schemeLabel = html.match(
      /<label[^>]*for="([^"]+)"[^>]*>settings\.colorScheme<\/label>/,
    );
    expect(localeLabel).not.toBeNull();
    expect(schemeLabel).not.toBeNull();
    for (const label of [localeLabel, schemeLabel]) {
      const input = selects.find(([match]) =>
        match.includes(`id="${label![1]}"`),
      );
      expect(input).toBeTruthy();
    }
  });
});
