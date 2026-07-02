import type { NextApiResponse } from "next";
import { z } from "zod";

import { withApiGuard } from "@/middleware/apiGuard";
import UserModel from "@/models/Users";
import type { AuthenticatedRequest } from "@/types/api";
import { simulateBattle } from "@/utils/attackFunctions";
import { logError } from "@/utils/logger";
import { stringifyObj } from "@/utils/numberFormatting";

const MAX_QUANTITY = 1_000_000_000;
const MAX_ARRAY_SIZE = 128;

const UnitSchema = z.object({
  id: z.coerce.number().int().min(0).default(0),
  userId: z.coerce.number().int().min(0).default(0),
  type: z.enum(["CITIZEN", "WORKER", "OFFENSE", "DEFENSE", "SPY", "SENTRY"]),
  level: z.coerce.number().int().min(1).max(10),
  quantity: z.coerce.number().int().min(0).max(MAX_QUANTITY),
  isMercenary: z.boolean().default(false),
});

const ItemSchema = z.object({
  id: z.coerce.number().int().min(0).default(0),
  userId: z.coerce.number().int().min(0).default(0),
  usage: z.enum(["OFFENSE", "DEFENSE"]),
  type: z.enum(["WEAPON", "HELM", "ARMOR", "BOOTS", "BRACERS", "SHIELD"]),
  level: z.coerce.number().int().min(1).max(30),
  quantity: z.coerce.number().int().min(0).max(MAX_QUANTITY),
});

const BattleUpgradeSchema = z.object({
  id: z.coerce.number().int().min(0).default(0),
  userId: z.coerce.number().int().min(0).default(0),
  type: z.enum(["OFFENSE", "DEFENSE", "SPY", "SENTRY"]),
  level: z.coerce.number().int().min(1).max(10),
  quantity: z.coerce.number().int().min(0).max(MAX_QUANTITY),
});

const StructureUpgradeSchema = z.object({
  id: z.coerce.number().int().min(0).default(0),
  userId: z.coerce.number().int().min(0).default(0),
  type: z.enum(["OFFENSE", "SPY", "SENTRY", "ARMORY"]),
  level: z.coerce.number().int().min(1).max(30),
});

const SimulatorUserSchema = z
  .object({
    id: z.coerce.number().int().min(0).default(0),
    display_name: z.string().max(64).optional(),
    race: z.enum(["HUMAN", "ELF", "GOBLIN", "UNDEAD"]).optional(),
    class: z.enum(["FIGHTER", "CLERIC", "ASSASSIN", "THIEF"]).optional(),
    experience: z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    fort_level: z.coerce.number().int().min(1).max(30).optional(),
    fort_hitpoints: z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    attack_turns: z.coerce.number().int().min(0).max(50).optional(),
    UserUnit: z.array(UnitSchema).max(MAX_ARRAY_SIZE).optional(),
    UserItem: z.array(ItemSchema).max(MAX_ARRAY_SIZE).optional(),
    UserBattleUpgrade: z
      .array(BattleUpgradeSchema)
      .max(MAX_ARRAY_SIZE)
      .optional(),
    UserStructureUpgrade: z
      .array(StructureUpgradeSchema)
      .max(MAX_ARRAY_SIZE)
      .optional(),
  })
  .passthrough();

const TestAttackSchema = z.object({
  attacker: z.string(),
  defender: z.string(),
  turns: z.number().int().min(1).max(50).optional(),
});

const parseSimulatorUser = (value: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { success: false as const, message: "Invalid army JSON" };
  }

  const validated = SimulatorUserSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      success: false as const,
      message: "Invalid army payload",
      details: validated.error.flatten().fieldErrors,
    };
  }

  return { success: true as const, data: validated.data };
};

const guardedHandler = withApiGuard({
  methods: ["POST"],
  authMode: "none",
  rateLimitProfile: "attack",
  bodySchema: TestAttackSchema,
});

async function handler(
  _req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    body: z.infer<typeof TestAttackSchema>;
  },
) {
  try {
    const { attacker, defender, turns } = context.body;
    const parsedAttacker = parseSimulatorUser(attacker);
    const parsedDefender = parseSimulatorUser(defender);

    if (!parsedAttacker.success || !parsedDefender.success) {
      return res.status(400).json({
        message: "Invalid simulator payload",
        attacker: parsedAttacker.success ? undefined : parsedAttacker,
        defender: parsedDefender.success ? undefined : parsedDefender,
      });
    }

    const attackerUser = new UserModel(parsedAttacker.data);
    const defenderUser = new UserModel(parsedDefender.data);

    const result = await simulateBattle(
      attackerUser,
      defenderUser,
      defenderUser.fortHitpoints,
      turns ?? 10,
      true,
    );

    return res.status(200).json({
      results: stringifyObj(result),
      attackerStats: {
        unitTotals: attackerUser.unitTotals,
        attackPower: attackerUser.offense,
        defensePower: attackerUser.defense,
      },
      defenderStats: {
        unitTotals: defenderUser.unitTotals,
        attackPower: defenderUser.offense,
        defensePower: defenderUser.defense,
      },
    });
  } catch (error) {
    logError("Battle simulation error:", error);
    return res.status(500).json({ message: "Error simulating battle" });
  }
}

export default guardedHandler(handler);
