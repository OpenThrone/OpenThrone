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
  /** Supporter receipts and cancellation notices. */
  planId?: string;
  amountCents?: number;
  consentText?: string;
  accessUntil?: string | Date;
  /** Era-relaunch inactivity copy variant. */
  relaunch?: boolean;
  /** News post the relaunch copy links to. */
  newsId?: number;
  /** Single-use veteran claim link token. */
  claimToken?: string;
  /** Inactivity emails: signed one-click erasure link (no sign-in needed). */
  erasureToken?: string;
  /** Password reset and email change: the single-use token for the link. */
  resetToken?: string;
  /** Password reset: the account address, prefilled by the reset page. */
  email?: string;
}
export interface RenderEmailInput {
  kind:
    | EmailCampaignKind
    | 'ATTACK_NOTIFICATION'
    | 'SUPPORTER_RECEIPT'
    | 'SUPPORTER_CANCELED'
    | 'VETERAN_CLAIM'
    | 'PASSWORD_RESET'
    | 'EMAIL_CHANGE';
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
  const rootUrl = new URL(root);
  const loopback = ['localhost', '127.0.0.1'].includes(rootUrl.hostname);
  if (
    rootUrl.protocol !== 'https:' &&
    !(loopback && rootUrl.protocol === 'http:')
  )
    throw new Error('Email links must use HTTPS');
  const absolute = (path: string) => new URL(path, root).href;
  const category =
    vars.category ??
    (kind === 'SUPPORTER_RECEIPT' ||
    kind === 'SUPPORTER_CANCELED' ||
    kind === 'VETERAN_CLAIM' ||
    kind === 'PASSWORD_RESET' ||
    kind === 'EMAIL_CHANGE'
      ? 'TRANSACTIONAL'
      : kind === 'ATTACK_NOTIFICATION'
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
    deleteLink: vars.erasureToken
      ? absolute(
          `/account/confirm-erasure?notice=${encodeURIComponent(vars.erasureToken)}`,
        )
      : absolute('/account/delete-request'),
    plan:
      (copy.supporterPlans as Record<string, string>)[vars.planId ?? ''] ??
      vars.planId ??
      '',
    amount: `$${((vars.amountCents ?? 0) / 100).toFixed(2)} USD`,
    consent: vars.consentText ?? '',
    accessUntil: formatDate(vars.accessUntil),
    manageLink: absolute('/home/supporter'),
    termsLink: absolute('/legal/terms'),
    refundsLink: absolute('/legal/refunds'),
    newsLink: absolute(`/community/news/${vars.newsId ?? ''}`),
    claimLink: absolute(
      `/account/veteran-claim?token=${encodeURIComponent(vars.claimToken ?? '')}`,
    ),
    // Tokens ride in the URL fragment: browsers never send it to the server
    // or in Referer headers, and the page clears it after reading it.
    resetLink: absolute(
      `/account/password-reset/verify#${new URLSearchParams({
        token: vars.resetToken ?? '',
        email: vars.email ?? '',
      })}`,
    ),
    emailChangeLink: absolute(
      `/account/email-verify#${new URLSearchParams({
        token: vars.resetToken ?? '',
      })}`,
    ),
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
      subject = vars.relaunch ? copy.relaunchNoticeSubject : copy.noticeSubject;
      body = interpolate(
        vars.relaunch ? copy.relaunchNotice : copy.notice,
        values,
      );
      break;
    case 'INACTIVITY_REMINDER':
      if (!vars.deletionDate)
        throw new Error('Reminder requires the scheduled deletion date');
      // Relaunch notices never get a reminder (their email is the last one).
      subject = copy.reminderSubject;
      body = interpolate(copy.reminder, values);
      break;
    case 'SUPPORTER_RECEIPT':
      subject = copy.receiptSubject;
      body = interpolate(copy.receiptBody, {
        ...values,
        renewal: interpolate(
          vars.planId === 'supporter_monthly'
            ? copy.renewalMonthly
            : copy.renewalOnce,
          values,
        ),
      });
      break;
    case 'SUPPORTER_CANCELED':
      subject = copy.canceledSubject;
      body = interpolate(copy.canceledBody, values);
      break;
    case 'VETERAN_CLAIM':
      if (!vars.claimToken) throw new Error('Claim email requires a token');
      subject = copy.veteranClaimSubject;
      body = interpolate(copy.veteranClaim, values);
      break;
    case 'PASSWORD_RESET':
      if (!vars.resetToken || !vars.email)
        throw new Error('Password reset email requires a token and address');
      subject = copy.passwordResetSubject;
      body = interpolate(copy.passwordReset, values);
      break;
    case 'EMAIL_CHANGE':
      if (!vars.resetToken)
        throw new Error('Email change email requires a token');
      subject = copy.emailChangeSubject;
      body = interpolate(copy.emailChange, values);
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
          ? kind === 'INACTIVITY_NOTICE' && vars.relaunch
            ? [values.loginLink, values.deleteLink, values.newsLink]
            : [values.loginLink, values.deleteLink]
          : kind === 'SUPPORTER_RECEIPT' || kind === 'SUPPORTER_CANCELED'
            ? [values.manageLink, values.termsLink, values.refundsLink]
            : kind === 'VETERAN_CLAIM'
              ? [values.claimLink]
              : kind === 'PASSWORD_RESET'
                ? [values.resetLink]
                : kind === 'EMAIL_CHANGE'
                  ? [values.emailChangeLink]
                  : [];
  // Token links read as a labelled action in HTML instead of a long URL.
  const linkLabels: Record<string, string> = {
    [values.resetLink]: copy.passwordResetAction,
    [values.emailChangeLink]: copy.emailChangeAction,
  };
  const linkParagraph = (paragraph: string) => {
    let html = escapeEmailHtml(paragraph).replace(/\n/g, '<br>');
    for (const link of bodyLinks) {
      const escaped = escapeEmailHtml(link);
      const label = escapeEmailHtml(linkLabels[link] ?? link);
      html = html.split(escaped).join(`<a href="${escaped}">${label}</a>`);
    }
    return `<p>${html}</p>`;
  };
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(linkParagraph)
    .join('');
  return {
    subject: subject.replace(/[\r\n]/g, ' '),
    text:
      category === 'TRANSACTIONAL'
        ? `OpenThrone\n\n${body}\n\n${copy.operator}`
        : `OpenThrone\n\n${body}\n\n${copy.manage}: ${preferences}\n${copy.unsubscribe}: ${unsubscribe}\n${copy.operator}`,
    html: `<!doctype html><html lang="${language === 'es' || language === 'de' ? language : 'en'}"><body><header><h1>OpenThrone</h1></header><main>${paragraphs}</main><footer>${category === 'TRANSACTIONAL' ? '' : `<p><a href="${escapeEmailHtml(preferences)}">${copy.manage}</a> · <a href="${escapeEmailHtml(unsubscribe)}">${copy.unsubscribe}</a></p>`}<p>${copy.operator}</p></footer></body></html>`,
  };
}
