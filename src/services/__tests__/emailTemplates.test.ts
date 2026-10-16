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
