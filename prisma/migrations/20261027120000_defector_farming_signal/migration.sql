-- Defector farming (#205 phase 3): a receiver repeatedly collecting one
-- loser's defectors (3+ distinct OT days, or >= 50% of everything that loser
-- lost to desertion in a rolling 14-day window) raises a signal-only cheat
-- marker for staff review. Gameplay is never blocked.

ALTER TYPE "CheatSignalType" ADD VALUE 'DEFECTOR_FARMING';
