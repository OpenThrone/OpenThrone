import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { renderEmail } from '@/services/emailTemplates';

let root: string | undefined;
beforeEach(() => {
  root = process.env.NEXT_PUBLIC_URL_ROOT;
  process.env.NEXT_PUBLIC_URL_ROOT = 'https://example.test';
});
afterEach(() => {
  if (root === undefined) delete process.env.NEXT_PUBLIC_URL_ROOT;
  else process.env.NEXT_PUBLIC_URL_ROOT = root;
});
describe('localized email templates', () => {
  it('escapes admin-authored content instead of interpreting HTML or markdown', () => {
    const rendered = renderEmail({
      kind: 'BROADCAST',
      locale: 'en-US',
      vars: {
        userId: 1,
        subject: 'Test\r\nSubject',
        body: '<script>alert("x")</script>\n\n[click](javascript:evil) & \'quote\'',
      },
    });
    expect(rendered.subject).toBe('Test  Subject');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('&amp;');
    expect(rendered.html).toContain('&#39;quote&#39;');
    expect(rendered.html).not.toContain('href="javascript:');
    expect(rendered.text).toContain('<script>');
    expect(rendered.html).toContain('https://example.test/home/settings#email');
    expect(rendered.text).toContain('Operated by AIOXperts IT Solutions LLC');
  });
  it('localizes news in all supported locales and falls back to English', () => {
    for (const [locale, prefix] of [
      ['en-US', 'OpenThrone news:'],
      ['es-ES', 'Noticias de OpenThrone:'],
      ['de-DE', 'OpenThrone-Neuigkeiten:'],
      ['fr', 'OpenThrone news:'],
    ]) {
      const rendered = renderEmail({
        kind: 'NEWS',
        locale,
        vars: {
          userId: 1,
          title: '<b>News</b>',
          excerpt: '<img src=x onerror=evil>',
          id: 7,
        },
      });
      expect(rendered.subject.startsWith(prefix)).toBe(true);
      expect(rendered.html).toContain('&lt;b&gt;News&lt;/b&gt;');
      expect(rendered.html).not.toContain('<img');
      expect(rendered.text).toContain('https://example.test/community/news/7');
    }
  });
  it('includes lifecycle dates and recovery links, escaping names', () => {
    const rendered = renderEmail({
      kind: 'INACTIVITY_NOTICE',
      locale: 'en',
      vars: {
        userId: 1,
        display_name: '<script>x</script>',
        lastActiveDate: '2025-01-01',
        deletionDate: '2027-04-09',
      },
    });
    expect(rendered.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(rendered.text).toContain('April 9, 2027');
    expect(rendered.text).toContain('180-day');
    expect(rendered.text).toContain('/account/delete-request');
    expect(rendered.text).toContain('/account/login');
    const reminder = renderEmail({
      kind: 'INACTIVITY_REMINDER',
      locale: 'en',
      vars: { userId: 1, deletionDate: '2027-04-09' },
    });
    expect(reminder.text).toContain('30 days left');
    expect(() =>
      renderEmail({
        kind: 'INACTIVITY_REMINDER',
        locale: 'en',
        vars: { userId: 1 },
      }),
    ).toThrow('scheduled deletion');
  });
  it('renders the relaunch notice with a news link anchor in every locale', () => {
    const twoYearPhrase: Record<string, string> = {
      en: 'two years',
      de: 'zwei Jahren',
      es: 'dos años',
    };
    const purgeDate: Record<string, string> = {
      en: 'January 31, 2027',
      de: '31. Januar 2027',
      es: '31 de enero de 2027',
    };
    const lastEmail: Record<string, string> = {
      en: 'this is the last email',
      de: 'ist dies die letzte E-Mail',
      es: 'este es el último correo',
    };
    for (const locale of ['en', 'de-DE', 'es-ES']) {
      const rendered = renderEmail({
        kind: 'INACTIVITY_NOTICE',
        locale,
        vars: {
          userId: 1,
          display_name: 'Player',
          relaunch: true,
          newsId: 7,
          deletionDate: '2027-01-31',
        },
      });
      expect(rendered.text).toContain('https://example.test/community/news/7');
      expect(rendered.html).toContain(
        'href="https://example.test/community/news/7"',
      );
      expect(rendered.text).toContain('https://example.test/account/login');
      expect(rendered.text).toContain(
        'https://example.test/account/delete-request',
      );
      // The promise that makes the fingerprint worth keeping.
      expect(rendered.text).toContain(twoYearPhrase[locale.split('-')[0]]);
      // The purge date the admin picked, and the "last email" promise.
      expect(rendered.text).toContain(purgeDate[locale.split('-')[0]]);
      expect(rendered.text).toContain(lastEmail[locale.split('-')[0]]);
      expect(rendered.text).toContain('2026');
    }
  });
  it('links the inactivity delete step to the one-click page when a token is given', () => {
    const erasureToken = 'eyJ1Ijo3fQ.c2ln';
    const link = `https://example.test/account/confirm-erasure?notice=${erasureToken}`;
    for (const relaunch of [true, false]) {
      const rendered = renderEmail({
        kind: 'INACTIVITY_NOTICE',
        locale: 'en',
        vars: {
          userId: 1,
          display_name: 'Player',
          relaunch,
          newsId: 7,
          deletionDate: '2027-01-31',
          erasureToken,
        },
      });
      expect(rendered.text).toContain(link);
      expect(rendered.html).toContain(`href="${link}"`);
      expect(rendered.text).not.toContain('/account/delete-request');
    }
    // Without a token (old queued mail) the public explainer page remains.
    expect(
      renderEmail({
        kind: 'INACTIVITY_NOTICE',
        locale: 'en',
        vars: { userId: 1, deletionDate: '2027-01-31' },
      }).text,
    ).toContain('https://example.test/account/delete-request');
  });
  it('renders the veteran claim link as a transactional email in every locale', () => {
    const token = 'b'.repeat(64);
    for (const locale of ['en', 'de-DE', 'es-ES']) {
      const rendered = renderEmail({
        kind: 'VETERAN_CLAIM',
        locale,
        vars: { userId: 1, display_name: 'Player', claimToken: token },
      });
      const link = `https://example.test/account/veteran-claim?token=${token}`;
      expect(rendered.text).toContain(link);
      expect(rendered.html).toContain(`href="${link}"`);
      // A security mail: no unsubscribe footer.
      expect(rendered.text).not.toContain('unsubscribe?token=');
    }
    expect(() =>
      renderEmail({ kind: 'VETERAN_CLAIM', locale: 'en', vars: { userId: 1 } }),
    ).toThrow('token');
  });
  it('renders a relaunch-flagged reminder with the standard copy', () => {
    // Relaunch notices never get a reminder; the old relaunch reminder copy
    // is gone, so a stray flag must not produce a dead news link.
    const rendered = renderEmail({
      kind: 'INACTIVITY_REMINDER',
      locale: 'en',
      vars: {
        userId: 1,
        relaunch: true,
        newsId: 7,
        deletionDate: '2027-01-31',
      },
    });
    expect(rendered.text).toContain('30 days left');
    expect(rendered.text).not.toContain('/community/news');
  });
  it('keeps the standard notice and reminder unchanged without the relaunch flag', () => {
    const notice = renderEmail({
      kind: 'INACTIVITY_NOTICE',
      locale: 'en',
      vars: {
        userId: 1,
        display_name: 'Player',
        deletionDate: '2027-04-09',
        lastActiveDate: '2025-01-01',
      },
    });
    expect(notice.text).not.toContain('/community/news');
    expect(notice.html).not.toContain('/community/news');
    expect(notice.text).toContain('180-day');
    const reminder = renderEmail({
      kind: 'INACTIVITY_REMINDER',
      locale: 'en',
      vars: {
        userId: 1,
        display_name: 'Player',
        deletionDate: '2027-04-09',
        lastActiveDate: '2025-01-01',
      },
    });
    expect(reminder.text).not.toContain('/community/news');
    expect(reminder.html).not.toContain('/community/news');
    expect(reminder.text).toContain('30 days left');
  });
});

it('renders safe localized optional battle alerts with report and unsubscribe links', () => {
  for (const [locale, outcome] of [
    ['en-US', 'Victory'],
    ['es-ES', 'Victoria'],
    ['de-DE', 'Sieg'],
    ['fr', 'Victory'],
  ]) {
    const rendered = renderEmail({
      kind: 'ATTACK_NOTIFICATION',
      locale,
      vars: {
        userId: 2,
        display_name: '<img src=x>',
        attackerName: '<script>enemy</script>\r\nX-Test: bad',
        attackLogId: 31,
        defenderWon: true,
      },
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;script&gt;enemy&lt;/script&gt;');
    expect(rendered.subject).not.toMatch(/[\r\n]/);
    expect(rendered.text).toContain(outcome);
    expect(rendered.html).toContain(
      'href="https://example.test/battle/results/31"',
    );
    const match = rendered.text.match(/token=([^\s]+)/)!;
    const { verifyUnsubscribeToken } = require('@/utils/unsubscribeToken');
    expect(verifyUnsubscribeToken(decodeURIComponent(match[1]))).toEqual({
      userId: 2,
      category: 'ATTACK_NOTIFICATION',
    });
  }
  const lost = renderEmail({
    kind: 'ATTACK_NOTIFICATION',
    locale: 'en',
    vars: { userId: 2, attackLogId: 31, defenderWon: false },
  });
  expect(lost.text).toContain('Defeat');
  expect(() =>
    renderEmail({
      kind: 'ATTACK_NOTIFICATION',
      locale: 'en',
      vars: { userId: 2 },
    }),
  ).toThrow('attack log ID');
});

describe('password reset and email change links', () => {
  const TOKEN = 'a'.repeat(64);

  it('puts the reset token and address in the fragment and hides the token in HTML', () => {
    const rendered = renderEmail({
      kind: 'PASSWORD_RESET',
      locale: 'en',
      vars: {
        userId: 4,
        display_name: 'Aria',
        email: 'aria+x@example.test',
        resetToken: TOKEN,
      },
    });
    const link = `https://example.test/account/password-reset/verify#token=${TOKEN}&email=aria%2Bx%40example.test`;
    expect(rendered.subject).toBe('Reset your OpenThrone password');
    expect(rendered.text).toContain(link);
    expect(rendered.text).not.toContain('token is');
    expect(rendered.html).toContain(`href="${link.replace(/&/g, '&amp;')}"`);
    expect(rendered.html).toContain('>Reset your password</a>');
    // The token appears only inside the href, never as visible text.
    expect(rendered.html.split(TOKEN).length - 1).toBe(1);
    expect(rendered.text).not.toContain('/api/email/unsubscribe');
  });

  it('links the email change page with the token in the fragment', () => {
    const rendered = renderEmail({
      kind: 'EMAIL_CHANGE',
      locale: 'de',
      vars: { userId: 4, display_name: 'Aria', resetToken: TOKEN },
    });
    expect(rendered.subject).toContain('OpenThrone');
    expect(rendered.text).toContain(
      `https://example.test/account/email-verify#token=${TOKEN}`,
    );
    expect(rendered.html).toContain('>E-Mail-Adresse ändern</a>');
    expect(rendered.html.split(TOKEN).length - 1).toBe(1);
  });

  it('localizes both templates in es', () => {
    for (const kind of ['PASSWORD_RESET', 'EMAIL_CHANGE'] as const) {
      const rendered = renderEmail({
        kind,
        locale: 'es-ES',
        vars: { userId: 4, email: 'a@example.test', resetToken: TOKEN },
      });
      expect(rendered.text).toContain('caduca en 3 horas');
    }
  });

  it('refuses to render without the token or address', () => {
    expect(() =>
      renderEmail({
        kind: 'PASSWORD_RESET',
        locale: 'en',
        vars: { userId: 4, resetToken: TOKEN },
      }),
    ).toThrow('token and address');
    expect(() =>
      renderEmail({ kind: 'EMAIL_CHANGE', locale: 'en', vars: { userId: 4 } }),
    ).toThrow('requires a token');
  });

  it('allows plain http only for a loopback root', () => {
    const render = () =>
      renderEmail({
        kind: 'EMAIL_CHANGE',
        locale: 'en',
        vars: { userId: 4, resetToken: TOKEN },
      });
    process.env.NEXT_PUBLIC_URL_ROOT = 'http://localhost:3000';
    expect(render().text).toContain(
      'http://localhost:3000/account/email-verify#',
    );
    process.env.NEXT_PUBLIC_URL_ROOT = 'http://openthrone.example';
    expect(render).toThrow('HTTPS');
  });
});
