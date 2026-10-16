const SENSITIVE_USER_FIELDS = [
  'password_hash',
  'twoFactorSecret',
  'encrypted_password',
  'recovery_token',
  'confirmation_token',
  'email_change_token_current',
  'email_change_token_new',
  'reauthentication_token',
  'phone_change_token',
  'raw_app_meta_data',
  'raw_user_meta_data',
] as const;

export function sanitizeUserForResponse<T extends Record<string, unknown>>(
  user: T,
): Partial<T> {
  const sanitized = { ...user };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete (sanitized as Record<string, unknown>)[field];
  }
  return sanitized;
}
