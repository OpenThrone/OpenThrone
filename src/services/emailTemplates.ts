import type { EmailCampaignKind, EmailCategory } from '@/lib/prisma-exports';
import { createUnsubscribeToken } from '@/utils/unsubscribeToken';

import de from '../../public/locales/de/email.json';
import en from '../../public/locales/en/email.json';
import es from '../../public/locales/es/email.json';

export interface EmailTemplateVars {
  userId: number;
  attackerName?: string;
  attackLogId?: number;
  defenderWon?: boolean;
  category?: EmailCategory;
  subject?: string;
  body?: string;
  title?: string;
  excerpt?: string;
  id?: number;
  display_name?: string;
  lastActiveDate?: string | Date;
  deletionDate?: string | Date;
}
export interface RenderEmailInput {
  kind: EmailCampaignKind | 'ATTACK_NOTIFICATION';
  locale: string;
  vars: EmailTemplateVars;
}
export const escapeEmailHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
const interpolate = (template: string, vars: Record<string, string>) =>
  template.replace(/{{(\w+)}}/g, (_, key: string) => vars[key] ?? '');

/** Imported locale JSON follows the server's public/locales resources without filesystem work per send. */
export function renderEmail({ kind, locale, vars }: RenderEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const language = locale.split(/[-_]/)[0];
  const copy = language === 'es' ? es : language === 'de' ? de : en;
  const root = process.env.NEXT_PUBLIC_URL_ROOT;
  if (!root) throw new Error('NEXT_PUBLIC_URL_ROOT is required for email');
  if (new URL(root).protocol !== 'https:')
    throw new Error('Email links must use HTTPS');
  const absolute = (path: string) => new URL(path, root).href;
  const category =
    vars.category ??
    (kind === 'ATTACK_NOTIFICATION'
      ? 'ATTACK_NOTIFICATION'
      : kind === 'NEWS'
        ? 'NEWS'
        : kind === 'BROADCAST'
          ? 'ANNOUNCEMENT'
          : 'ACCOUNT_LIFECYCLE');
  const unsubscribe = absolute(
    `/api/email/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(vars.userId, category))}`,
  );
  const preferences = absolute('/home/settings#email');
  const formatDate = (value: string | Date | undefined) =>
    value
      ? new Date(value).toLocaleDateString(
          language === 'es' ? 'es-ES' : language === 'de' ? 'de-DE' : 'en-US',
          { dateStyle: 'long', timeZone: 'UTC' },
        )
      : '';
  const values = {
    attackerName: vars.attackerName ?? '',
    outcome: vars.defenderWon ? copy.battleVictory : copy.battleDefeat,
    reportLink: absolute(`/battle/results/${vars.attackLogId ?? ''}`),
    title: vars.title ?? '',
    display_name: vars.display_name ?? '',
    lastActiveDate: formatDate(vars.lastActiveDate),
    deletionDate: formatDate(
      vars.deletionDate ?? new Date(Date.now() + 180 * 86_400_000),
    ),
    loginLink: absolute('/account/login'),
    deleteLink: absolute('/account/delete-request'),
  };
  let subject: string;
  let body: string;
  switch (kind) {
    case 'ATTACK_NOTIFICATION':
      if (
        typeof vars.attackLogId !== 'number' ||
        !Number.isSafeInteger(vars.attackLogId) ||
        vars.attackLogId < 1
      )
        throw new Error('Battle alert requires an attack log ID');
      subject = interpolate(copy.battleSubject, values);
      body = interpolate(copy.battleBody, values);
      break;
    case 'BROADCAST':
      subject = vars.subject ?? vars.title ?? 'OpenThrone';
      body = vars.body ?? '';
      break;
    case 'NEWS':
      subject = interpolate(copy.newsSubject, values);
      body = `${vars.title ?? ''}\n\n${vars.excerpt ?? ''}\n\n${absolute(`/community/news/${vars.id ?? ''}`)}`;
      break;
    case 'INACTIVITY_NOTICE':
      subject = copy.noticeSubject;
      body = interpolate(copy.notice, values);
      break;
    case 'INACTIVITY_REMINDER':
      if (!vars.deletionDate)
        throw new Error('Reminder requires the scheduled deletion date');
      subject = copy.reminderSubject;
      body = interpolate(copy.reminder, values);
      break;
    default:
      throw new Error('Unknown email template');
  }
  const bodyLinks =
    kind === 'ATTACK_NOTIFICATION'
      ? [values.reportLink]
      : kind === 'NEWS'
        ? [absolute(`/community/news/${vars.id ?? ''}`)]
        : kind === 'INACTIVITY_NOTICE' || kind === 'INACTIVITY_REMINDER'
          ? [values.loginLink, values.deleteLink]
          : [];
  const linkParagraph = (paragraph: string) => {
    let html = escapeEmailHtml(paragraph).replace(/\n/g, '<br>');
    for (const link of bodyLinks) {
      const escaped = escapeEmailHtml(link);
      html = html.split(escaped).join(`<a href="${escaped}">${escaped}</a>`);
    }
    return `<p>${html}</p>`;
  };
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(linkParagraph)
    .join('');
  return {
    subject: subject.replace(/[\r\n]/g, ' '),
    text: `OpenThrone\n\n${body}\n\n${copy.manage}: ${preferences}\n${copy.unsubscribe}: ${unsubscribe}\n${copy.operator}`,
    html: `<!doctype html><html lang="${language === 'es' || language === 'de' ? language : 'en'}"><body><header><h1>OpenThrone</h1></header><main>${paragraphs}</main><footer><p><a href="${escapeEmailHtml(preferences)}">${copy.manage}</a> · <a href="${escapeEmailHtml(unsubscribe)}">${copy.unsubscribe}</a></p><p>${copy.operator}</p></footer></body></html>`,
  };
}
