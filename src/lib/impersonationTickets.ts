import { randomUUID } from 'crypto';

/** `start` switches an admin into a player; `return` switches back (#92). */
export type ImpersonationTicketKind = 'start' | 'return';

type TicketRecord = {
  adminUserId: number;
  targetUserId: number;
  kind: ImpersonationTicketKind;
  expiresAt: number;
};

const TICKET_TTL_MS = 60_000;

/**
 * Impersonation is for diagnostics: an impersonated session lasts at most
 * this long and is then signed out entirely (#92).
 */
export const IMPERSONATION_MAX_MS = 10 * 60_000;
const tickets = new Map<string, TicketRecord>();

const purgeExpired = () => {
  const now = Date.now();
  for (const [ticket, record] of tickets.entries()) {
    if (record.expiresAt <= now) {
      tickets.delete(ticket);
    }
  }
};

/** Create impersonation ticket. */
export const createImpersonationTicket = (
  adminUserId: number,
  targetUserId: number,
  kind: ImpersonationTicketKind = 'start',
) => {
  purgeExpired();
  const ticket = randomUUID();
  tickets.set(ticket, {
    adminUserId,
    targetUserId,
    kind,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return ticket;
};

/** Consume impersonation ticket. */
export const consumeImpersonationTicket = (ticket: string) => {
  purgeExpired();
  const record = tickets.get(ticket);
  if (!record) {
    return null;
  }
  tickets.delete(ticket);
  if (record.expiresAt <= Date.now()) {
    return null;
  }
  return record;
};
