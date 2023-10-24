'use server';
import { Fortifications, UnitTypes, WeaponTypes } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { PlayerUnit, PlayerItem } from '@/types/typings';

function simulateBattle(attacker: UserModel, defender: UserModel, attackTurns: number): any {
  let results: any = {};
  let attackerLosses: any = {};
  let defenderLosses: any = {};
  let totalAttackerLosses = 0;
  let totalDefenderLosses = 0;

  // Early exit if the attacker's offense is negligible
  if (attacker.offense <= 0) {
    return {
      Results: {
        attacker_losses: {},
        defender_losses: {}
      },
      Winner: "Defender",
      TotalAttackerLosses: 0,
      TotalDefenderLosses: 0
    };
  }

  // Helper function to calculate total bonus for a unit
  const calculateTotalBonus = (
    unit: PlayerUnit,
    items: PlayerItem[]
  ): number => {
    let bonus = 0;

    // Get base bonus from the Unit's data
    const unitData = UnitTypes.find(
      u => u.type === unit.type && u.level === unit.level
    );
    if (unitData) {
      bonus += unitData.bonus;
    }

    for (let item of items) {
      if (item.unitType === unit.type && item.level === unit.level) {
        // Get bonus from the Weapon's data
        const weaponData = WeaponTypes.find(
          w =>
            w.usage === item.unitType &&
            w.type === item.type &&
            w.level === item.level
        );
        if (weaponData) {
          bonus += weaponData.bonus * item.quantity;
        }
      }
    }
    return bonus;
  };

  for (let attUnit of attacker.units) {
    if (attUnit.hasAttacked) {
      continue;
    }
    for (let defUnit of defender.units) {
      if (attUnit.quantity <= 0 || defUnit.quantity <= 0) {
        continue;
      }

      if (attUnit.type !== "OFFENSE" || defUnit.type !== "DEFENSE") {
        continue;
      }

      let attTotalBonus = calculateTotalBonus(attUnit, attacker.items);
      let defTotalBonus = calculateTotalBonus(defUnit, defender.items);

      const getRandomMultiplier = (levelDiff: number): number => {
        // The level difference will have an impact on the randomness of the damage multiplier.
        const baseRandomness = Math.random() * 0.1 + 0.95; // Between 0.95 and 1.05
        const levelModifier = 0.01 * levelDiff; // Adjust this value to make level difference have more or less impact.
        return baseRandomness + levelModifier;
      };

      const calculateDamage = (
        attBonus: number,
        defBonus: number,
        attQuantity: number,
        defQuantity: number
      ): { attDmg: number; defDmg: number } => {
        // You can adjust these constants as per the game's requirement
        const ATT_CONST = 0.5;
        const DEF_CONST = 0.5;

        const attRandomMultiplier = getRandomMultiplier(
          attacker.level - defender.level
        );
        const defRandomMultiplier = getRandomMultiplier(
          defender.level - attacker.level
        );

        const attDmg = defBonus * DEF_CONST * defQuantity * attRandomMultiplier;
        const defDmg = attBonus * ATT_CONST * attQuantity * defRandomMultiplier;

        return { attDmg, defDmg };
      };

      const { attDmg, defDmg } = calculateDamage(
        attTotalBonus,
        defTotalBonus,
        attUnit.quantity,
        defUnit.quantity
      );

      const attUnitData = UnitTypes.find(
        (u) => u.type === attUnit.type && u.level === attUnit.level
      );
      const defUnitData = UnitTypes.find(
        (u) => u.type === defUnit.type && u.level === defUnit.level
      );

      // Assuming the HP of a unit is static and not modified by any bonus.
      const totalAttUnitHP = attUnitData?.hp * attUnit.quantity || 0;
      const totalDefUnitHP = defUnitData?.hp * defUnit.quantity || 0;

      let attUnitLoss = Math.min(
        attUnit.quantity,
        Math.ceil((attDmg / totalAttUnitHP) * attUnit.quantity)
      );
      let defUnitLoss = Math.min(
        defUnit.quantity,
        Math.ceil((defDmg / totalDefUnitHP) * defUnit.quantity)
      );

      attUnit.quantity = Math.max(0, attUnit.quantity - attUnitLoss);
      defUnit.quantity = Math.max(0, defUnit.quantity - defUnitLoss);

      attackerLosses[`${attUnit.type}-${attUnit.level}`] =
        (attackerLosses[`${attUnit.type}-${attUnit.level}`] || 0) + attUnitLoss;
      defenderLosses[`${defUnit.type}-${defUnit.level}`] =
        (defenderLosses[`${defUnit.type}-${defUnit.level}`] || 0) + defUnitLoss;

      totalAttackerLosses += attUnitLoss;
      totalDefenderLosses += defUnitLoss;

      attUnit.hasAttacked = true;
      break;
    }
  }

  // Adjust for CITIZEN or WORKER losses on the defender's side
  if (
    defender.fortHitpoints <= 0 /*||
    !defender.units.some((unit) => unit.type === "DEFENSE" && unit.quantity > 0)*/
  ) {
    const civilianUnits = ["CITIZEN", "WORKER"];
    for (let civUnitType of civilianUnits) {
      const civUnit = defender.units.find((unit) => unit.type === civUnitType);
      if (civUnit && civUnit.quantity > 0) {
        let loss = Math.min(
          civUnit.quantity,
          attackTurns * Math.round(civUnit.quantity * (Math.random() * 0.1 + 0.05))
        );
        civUnit.quantity -= loss;
        defenderLosses[`${civUnitType}-${civUnit.level}`] =
          (defenderLosses[`${civUnitType}-${civUnit.level}`] || 0) + loss;
        totalDefenderLosses += loss;
      }
    }
  }


  results = {
    attacker_losses: attackerLosses,
    defender_losses: defenderLosses
  };


  // Determine the winner
  let totalOffense = attacker.offense;
  let totalDefense = defender.defense;

  let winner = totalOffense > totalDefense ? "Attacker" : (totalOffense < totalDefense ? "Defender" : "Draw");

  return {
    Results: results,
    Winner: winner,
    TotalAttackerLosses: totalAttackerLosses,
    TotalDefenderLosses: totalDefenderLosses
  };
}

export async function attackHandler(attackerId, defenderId, attack_turns) {

  const attacker: UserModel = await prisma?.users.findUnique({
    where: { id: attackerId },
  });
  const defender: UserModel = await prisma?.users.findUnique({
    where: { id: defenderId },
  });
  if (!attacker || !defender) {
    return { status: 'failed', message: 'User not found' };
  }
  if (attacker.attackTurns < attack_turns) {
    return { status: 'failed', message: 'Insufficient attack turns' };
  }

  const AttackPlayer = new UserModel(attacker);
  const DefensePlayer = new UserModel(defender);

  // Check if attacker's offense is negligible
  if (AttackPlayer.offense <= 0) {
    return {
      status: 'failed',
      message: 'Attack unsuccessful due to negligible offense.'
    };
  }

  const startOfAttack = {
    Attacker: JSON.parse(JSON.stringify(AttackPlayer)),
    Defender: JSON.parse(JSON.stringify(DefensePlayer))
  }

  console.log('Start of Attack - Defender Units', startOfAttack.Defender.units.filter(u => u.type === 'DEFENSE' || u.type === 'WORKER' || u.type === 'CITIZEN'));
  console.log('Start of Attack - Attacker Units', startOfAttack.Attacker.units.filter(u => u.type === 'OFFENSE'));
  console.log('Start of Attack - Defender Items', startOfAttack.Defender.items.filter(i => i.usage === 'DEFENSE' || i.usage === 'WORKER' || i.usage === 'CITIZEN'));
  console.log('Start of Attack - Attacker Items', startOfAttack.Attacker.items.filter(i => i.usage === 'OFFENSE'));
  console.log('Start of Attack - Defender Fort Health', startOfAttack.Defender.fortHitpoints);
  const startTurns = AttackPlayer.attackTurns;
  let GoldPerTurn = 0.8 / 10;

  const levelDifference = DefensePlayer.level - AttackPlayer.level;
  switch (levelDifference) {
    case 0:
      GoldPerTurn *= 0.05;
      break;
    case 1:
      GoldPerTurn *= 0.15;
      break;
    case 2:
      GoldPerTurn *= 0.35;
      break;
    case 3:
      GoldPerTurn *= 0.55;
      break;
    case 4:
      GoldPerTurn *= 0.75;
      break;
    default:
      if (levelDifference >= 5) GoldPerTurn *= 0.95;
      break;
  }

  const offenseToDefenseRatio = AttackPlayer.offense / (DefensePlayer.defense || 1);
  const scaledOffenseToDefenseRatio = Math.min(Math.max(offenseToDefenseRatio, 0), 2);
  let fortDamagePercentage = 0.1 * scaledOffenseToDefenseRatio;

  const modifiedFortDamagePercentage = fortDamagePercentage * (0.5 + scaledOffenseToDefenseRatio / 4);
  const DmgPerTurn = modifiedFortDamagePercentage / 10;

  // Fetch max HP for the defender's fort level
  const maxFortHP = Fortifications[DefensePlayer.fortLevel].hitpoints;
  // Calculate the fort damage and round it to the nearest integer
  const calculatedFortDmg = Math.min(Math.round(maxFortHP * DmgPerTurn * attack_turns), DefensePlayer.fortHitpoints);
  const battleResults = simulateBattle(AttackPlayer, DefensePlayer, attack_turns);

  if (DefensePlayer.fortHitpoints <= 0) {
    GoldPerTurn *= 1.05;
  }

  console.log('Attacker Losses', battleResults.Results.attacker_losses);
  console.log('Defender Losses', battleResults.Results.defender_losses);

  const isAttackerWinner = AttackPlayer.offense > DefensePlayer.defense;
  const pillagedGold = DefensePlayer.gold * GoldPerTurn * attack_turns;
  return {
    status: 'success',
    result: isAttackerWinner,
    attacker: AttackPlayer,
    defender: DefensePlayer,
    extra_variables: {
      'pillagedGold': pillagedGold,
      'GoldPerTurn': GoldPerTurn,
      'levelDifference': levelDifference,
      'fortDamagePercentage': modifiedFortDamagePercentage,
      'fortDmg': calculatedFortDmg,
      'offenseToDefenseRatio': scaledOffenseToDefenseRatio,
      'DmgPerTurn': DmgPerTurn,
      'BattleResults': battleResults
    }
  };


  if (isAttackerWinner) {
    DefensePlayer.gold -= pillagedGold;
    AttackPlayer.gold += pillagedGold;

    await prisma.bank_history.create({
      data: {
        gold_amount: pillagedGold,
        from_user_id: defenderId,
        from_user_account_type: 'HAND',
        to_user_id: attackerId,
        to_user_account_type: 'HAND',
        date_time: new Date().toISOString(),
        history_type: 'WAR_SPOILS',
      },
    });
  }

  DefensePlayer.fortHitpoints -= calculatedFortDmg;
  DefensePlayer.fortHitpoints = Math.max(0, DefensePlayer.fortHitpoints);
  const BaseXP = 1000;
  const LevelDifference = DefensePlayer.level - AttackPlayer.level;
  const LevelDifferenceBonus = LevelDifference > 0 ? LevelDifference * 0.05 * BaseXP : 0;
  const FortDestructionBonus = DefensePlayer.fortHitpoints <= 0 ? 0.5 * BaseXP : 0;
  const TurnsUsedMultiplier = attack_turns / 10;

  let XP = BaseXP + LevelDifferenceBonus + FortDestructionBonus;
  XP *= TurnsUsedMultiplier;

  AttackPlayer.experience += XP;

  const attack_log = await prisma.attack_log.create({
    data: {
      attacker_id: attackerId,
      defender_id: defenderId,
      timestamp: new Date().toISOString(),
      winner: isAttackerWinner ? attackerId : defenderId,
      stats: {
        startOfAttack: startOfAttack,
        startTurns: startTurns,
        endTurns: AttackPlayer.attackTurns,
        offensePointsAtStart: startOfAttack.Attacker.offense,
        defensePointsAtStart: startOfAttack.Defender.defense,
        offensePointsAtEnd: AttackPlayer.offense,
        defensePointsAtEnd: DefensePlayer.defense,
        pillagedGold: isAttackerWinner ? pillagedGold : 0,
        fortDamage: calculatedFortDmg,
        forthpAtStart: startOfAttack.Defender.fortHitpoints,
        forthpAtEnd: DefensePlayer.fortHitpoints,
        xpEarned: XP,
        turns: attack_turns,
        attacker_units: AttackPlayer.units,
        defender_units: DefensePlayer.units,
        attacker_losses: battleResults.Results.attacker_losses,
        defender_losses: battleResults.Results.defender_losses
      },
    },
  });

  await prisma.users.update({
    where: { id: attackerId },
    data: {
      gold: AttackPlayer.gold,
      attack_turns: AttackPlayer.attackTurns - attack_turns,
      experience: AttackPlayer.experience,
      units: AttackPlayer.units,
    },
  });
  console.log(DefensePlayer)
  await prisma.users.update({
    where: { id: defenderId },
    data: {
      gold: DefensePlayer.gold,
      fort_hitpoints: DefensePlayer.fortHitpoints,
      units: DefensePlayer.units,
    },
  });

  return {
    status: 'success',
    result: isAttackerWinner,
    attacker: AttackPlayer,
    defender: DefensePlayer,
    attack_log: attack_log.id,
    extra_variables: {
      'pillagedGold': pillagedGold,
      'XP': XP,
      'GoldPerTurn': GoldPerTurn,
      'levelDifference': levelDifference,
      'fortDamagePercentage': modifiedFortDamagePercentage,
      'fortDmg': calculatedFortDmg,
      'offenseToDefenseRatio': scaledOffenseToDefenseRatio,
      'DmgPerTurn': DmgPerTurn,
      'BattleResults': battleResults
    }
  };
  return { status: 'failed' };
}
