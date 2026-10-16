/** Reports configuration names only; never include secret values in errors. */
export function missingEmailSecrets(): string[] {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    return [];
  const missing: string[] = [];
  if (!(process.env.IDENTITY_HASH_SECRET ?? process.env.ANTI_ABUSE_SALT))
    missing.push('IDENTITY_HASH_SECRET (or ANTI_ABUSE_SALT)');
  if (!process.env.EMAIL_UNSUBSCRIBE_SECRET)
    missing.push('EMAIL_UNSUBSCRIBE_SECRET');
  return missing;
}
