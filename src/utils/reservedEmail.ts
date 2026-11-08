/**
 * Addresses at this domain are written by the system (erased and reset
 * accounts) and read by several jobs as "no longer a player". A player must
 * never be able to register or change to one.
 */
export const RESERVED_EMAIL_SUFFIX = '@deleted.local';

export const isReservedEmail = (email: string) =>
  email.trim().toLowerCase().endsWith(RESERVED_EMAIL_SUFFIX);

export const RESERVED_EMAIL_MESSAGE = 'This email domain is reserved.';
