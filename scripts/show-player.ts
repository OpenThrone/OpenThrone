import {
  createBalancedPlayer,
  createSimPlayer,
  getTotalOffense,
  getTotalDefense,
  computeArmyCost,
  runSingleBattle,
} from "../src/sim";

async function main() {
  const simPlayer = createBalancedPlayer(10, "offense");

  const units: any[] = [];

  if (simPlayer.units.soldier > 0) {
    units.push({
      type: "OFFENSE",
      level: 1,
      quantity: simPlayer.units.soldier,
      name: "Soldier",
    });
  }
  if (simPlayer.units.knight > 0) {
    units.push({
      type: "OFFENSE",
      level: 2,
      quantity: simPlayer.units.knight,
      name: "Knight",
    });
  }
  if (simPlayer.units.berserker > 0) {
    units.push({
      type: "OFFENSE",
      level: 3,
      quantity: simPlayer.units.berserker,
      name: "Berserker",
    });
  }

  const battleUser = {
    id: simPlayer.id,
    displayName: simPlayer.displayName,
    level: simPlayer.level,
    fortLevel: simPlayer.fortLevel,
    fortHitpoints: simPlayer.fortHp,
    gold: Number(simPlayer.gold),
    units,
    items: [],
    structure_upgrades: [],
    battle_upgrades: [
      { type: "OFFENSE", level: simPlayer.upgrades.offense },
      { type: "DEFENSE", level: simPlayer.upgrades.defense },
    ],
    attackBonus: simPlayer.bonuses.attack,
    defenseBonus: simPlayer.bonuses.defense,
    bonus_points: [],
    playerBonuses: [],
  };

  console.log("=== BattleUserLike (Internal Game Format) ===\n");
  console.log(JSON.stringify(battleUser, null, 2));

  console.log("\n=== Unit Stats (from constants) ===");
  console.log("Soldier (L1): MeleeAtk=5, MeleeDef=2, HP=10");
  console.log("Knight (L2):  MeleeAtk=15, MeleeDef=5, HP=20");
  console.log("Berserker(L3):MeleeAtk=40, MeleeDef=10, HP=30");
  console.log("\nGuard (L1):   MeleeDef=2, RangedDef=2, HP=10");
  console.log("Archer (L2):  MeleeDef=5, RangedDef=20, HP=20");
  console.log("Royal Guard: MeleeDef=10, RangedDef=5, HP=30");

  console.log("\n=== Sample Battle Result ===");
  const attacker = createBalancedPlayer(5, "offense");
  const defender = createBalancedPlayer(5, "defense");
  const result = await runSingleBattle(attacker, defender);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
