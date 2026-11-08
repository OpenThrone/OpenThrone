import { mercenaryOffer, MercenaryService } from '@/services/Mercenary.service';

type HireCommand = Parameters<typeof MercenaryService.hire>[0];

/** Hires send the quoted total the player saw (#233); default world rates. */
export const hireQuoted = (
  command: Omit<HireCommand, 'expectedTotal'>,
  at?: Date,
) => {
  const offer = mercenaryOffer(command.type, command.level);
  const total =
    BigInt(command.quantity) *
    (offer.mobilization + BigInt(command.termDays) * offer.dailyPrice);
  return MercenaryService.hire(
    { ...command, expectedTotal: total.toString() } as HireCommand,
    at,
  );
};
