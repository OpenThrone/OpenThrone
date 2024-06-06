ALTER TABLE "users"
ALTER COLUMN "structure_upgrades" SET DEFAULT '[{"type": "OFFENSE", "level": 1}, {"type": "SPY", "level": 1}, {"type": "SENTRY", "level": 1}, {"type": "ARMORY", "level": 1} ]';

ALTER TABLE "users"
ALTER COLUMN "battle_upgrades" SET DEFAULT '[{"type": "OFFENSE", "level": 1, "quantity": 0}, {"type": "DEFENSE", "level": 1, "quantity": 0}, {"type": "SPY", "level": 1, "quantity": 0}, {"type": "SENTRY", "level": 1, "quantity": 0}]'