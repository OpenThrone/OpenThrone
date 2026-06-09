import { randomUUID } from 'crypto';

type TicketRecord = {
  adminUserId: number;
  targetUserId: number;
  expiresAt: number;
};

const TICKET_TTL_MS = 60_000;
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
) => {
  purgeExpired();
  const ticket = randomUUID();
  tickets.set(ticket, {
    adminUserId,
    targetUserId,
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
