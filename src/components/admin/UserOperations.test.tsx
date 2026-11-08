import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import UserOperations from '@/components/admin/UserOperations';
import { themes } from '@/styles/themes';

// next-i18next renders keys without a loaded namespace; assert on the keys.
const en = {
  user: {
    suspendAction: 'user.suspendAction',
    banAction: 'user.banAction',
    reactivateAction: 'user.reactivateAction',
    closeAction: 'user.closeAction',
    eraseAction: 'user.eraseAction',
    statusHeading: 'user.statusHeading',
  },
};

const render = (props: {
  isAdministrator: boolean;
  canManageStatus?: boolean;
  currentStatus?: string;
}) =>
  renderToStaticMarkup(
    <MantineProvider theme={themes.HUMAN}>
      <UserOperations userId="42" onSaved={() => undefined} {...props} />
    </MantineProvider>,
  );

const buttonLabels = (html: string) =>
  [...html.matchAll(/mantine-Button-label[^>]*>([^<]+)</g)].map((m) => m[1]);

describe('Edit Player account status operations', () => {
  it('gives administrators suspend, ban, close and delete', () => {
    const labels = buttonLabels(
      render({
        isAdministrator: true,
        canManageStatus: true,
        currentStatus: 'ACTIVE',
      }),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        en.user.suspendAction,
        en.user.banAction,
        en.user.closeAction,
        en.user.eraseAction,
      ]),
    );
    // Nothing to lift on an active account.
    expect(labels).not.toContain(en.user.reactivateAction);
  });

  it('gives moderators with MANAGE_ACCOUNT_STATUS suspend and ban only', () => {
    const labels = buttonLabels(
      render({
        isAdministrator: false,
        canManageStatus: true,
        currentStatus: 'ACTIVE',
      }),
    );
    expect(labels).toContain(en.user.suspendAction);
    expect(labels).toContain(en.user.banAction);
    // Closing and erasing are administrator-only server-side.
    expect(labels).not.toContain(en.user.closeAction);
    expect(labels).not.toContain(en.user.eraseAction);
  });

  it('offers reactivation for banned, suspended and closed accounts', () => {
    for (const status of ['BANNED', 'SUSPENDED', 'CLOSED']) {
      const labels = buttonLabels(
        render({
          isAdministrator: true,
          canManageStatus: true,
          currentStatus: status,
        }),
      );
      expect(labels).toContain(en.user.reactivateAction);
    }
    expect(
      buttonLabels(
        render({
          isAdministrator: true,
          canManageStatus: true,
          currentStatus: 'CLOSED',
        }),
      ),
    ).not.toContain(en.user.closeAction);
  });

  it('hides status controls from staff without account-status access', () => {
    const html = render({ isAdministrator: false, currentStatus: 'ACTIVE' });
    expect(buttonLabels(html)).not.toContain(en.user.banAction);
    expect(html).not.toContain(en.user.statusHeading);
  });
});
