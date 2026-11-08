/**
 * Account-erasure emails. These are transactional messages the player asked
 * for, sent straight away rather than through the campaign outbox, so they
 * carry no unsubscribe link. Copy is kept here in en/de/es.
 */

type EmailLanguage = 'en' | 'de' | 'es';

interface ErasureEmailCopy {
  confirmSubject: string;
  confirmIntro: string;
  confirmAction: string;
  confirmExpiry: string;
  confirmIgnore: string;
  scheduledSubject: string;
  scheduledIntro: string;
  scheduledCancel: string;
}

const COPY: Record<EmailLanguage, ErasureEmailCopy> = {
  en: {
    confirmSubject: 'Confirm your OpenThrone account deletion request',
    confirmIntro:
      'Someone asked to delete your OpenThrone account and personal data.',
    confirmAction: 'To confirm, open this link:',
    confirmExpiry:
      'The link works once and expires in {{hours}} hours. Nothing changes until you confirm.',
    confirmIgnore:
      'If this was not you, ignore this email and consider changing your password.',
    scheduledSubject: 'Your OpenThrone account is scheduled for deletion',
    scheduledIntro:
      'Your account is now deactivated and will be erased on {{date}}.',
    scheduledCancel:
      'To keep it, sign in before then and choose "Cancel deletion": {{loginLink}}',
  },
  de: {
    confirmSubject: 'Bestätige die Löschung deines OpenThrone-Kontos',
    confirmIntro:
      'Jemand hat beantragt, dein OpenThrone-Konto und deine personenbezogenen Daten zu löschen.',
    confirmAction: 'Zur Bestätigung öffne diesen Link:',
    confirmExpiry:
      'Der Link funktioniert einmal und läuft in {{hours}} Stunden ab. Ohne Bestätigung ändert sich nichts.',
    confirmIgnore:
      'Warst du das nicht, ignoriere diese E-Mail und ändere am besten dein Passwort.',
    scheduledSubject: 'Dein OpenThrone-Konto ist zur Löschung vorgemerkt',
    scheduledIntro:
      'Dein Konto ist jetzt deaktiviert und wird am {{date}} gelöscht.',
    scheduledCancel:
      'Willst du es behalten, melde dich vorher an und wähle „Löschung abbrechen“: {{loginLink}}',
  },
  es: {
    confirmSubject: 'Confirma la eliminación de tu cuenta de OpenThrone',
    confirmIntro:
      'Alguien ha solicitado eliminar tu cuenta de OpenThrone y tus datos personales.',
    confirmAction: 'Para confirmar, abre este enlace:',
    confirmExpiry:
      'El enlace funciona una sola vez y caduca en {{hours}} horas. No cambia nada hasta que confirmes.',
    confirmIgnore:
      'Si no fuiste tú, ignora este correo y considera cambiar tu contraseña.',
    scheduledSubject: 'Tu cuenta de OpenThrone está programada para eliminarse',
    scheduledIntro: 'Tu cuenta está desactivada y se borrará el {{date}}.',
    scheduledCancel:
      'Para conservarla, inicia sesión antes y elige «Cancelar eliminación»: {{loginLink}}',
  },
};

const languageOf = (locale: string | null | undefined): EmailLanguage => {
  const language = (locale ?? 'en').split(/[-_]/)[0];
  return language === 'de' || language === 'es' ? language : 'en';
};

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/{{(\w+)}}/g, (_, key: string) => String(vars[key] ?? ''));

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] as string,
  );

const urlRoot = () => {
  const root = process.env.NEXT_PUBLIC_URL_ROOT;
  if (!root) throw new Error('NEXT_PUBLIC_URL_ROOT is required for email');
  return root;
};

export interface ErasureEmail {
  subject: string;
  text: string;
  html: string;
}

/** Email carrying the single-use confirmation link. */
export function renderErasureConfirmEmail(
  locale: string | null | undefined,
  token: string,
  ttlHours: number,
): ErasureEmail {
  const copy = COPY[languageOf(locale)];
  const link = new URL(
    `/account/confirm-erasure?token=${encodeURIComponent(token)}`,
    urlRoot(),
  ).href;
  const lines = [
    copy.confirmIntro,
    `${copy.confirmAction}\n${link}`,
    fill(copy.confirmExpiry, { hours: ttlHours }),
    copy.confirmIgnore,
  ];
  return {
    subject: copy.confirmSubject,
    text: lines.join('\n\n'),
    html: [
      `<p>${escapeHtml(copy.confirmIntro)}</p>`,
      `<p>${escapeHtml(copy.confirmAction)} <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
      `<p>${escapeHtml(fill(copy.confirmExpiry, { hours: ttlHours }))}</p>`,
      `<p>${escapeHtml(copy.confirmIgnore)}</p>`,
    ].join('\n'),
  };
}

/** Email sent once the request is confirmed and the grace period has begun. */
export function renderErasureScheduledEmail(
  locale: string | null | undefined,
  scheduledFor: Date,
): ErasureEmail {
  const language = languageOf(locale);
  const copy = COPY[language];
  const date = scheduledFor.toLocaleDateString(
    language === 'es' ? 'es-ES' : language === 'de' ? 'de-DE' : 'en-US',
    { dateStyle: 'long', timeZone: 'UTC' },
  );
  const loginLink = new URL('/account/login', urlRoot()).href;
  const intro = fill(copy.scheduledIntro, { date });
  const cancel = fill(copy.scheduledCancel, { loginLink });
  return {
    subject: copy.scheduledSubject,
    text: `${intro}\n\n${cancel}`,
    html: `<p>${escapeHtml(intro)}</p>\n<p>${escapeHtml(cancel)}</p>`,
  };
}
