'use server';
import { Fortifications, UnitTypes, WeaponTypes } from '@/constants';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import results from '@/pages/battle/results/[id]';
import { PlayerUnit, PlayerItem } from '@/types/typings';
import { number, any } from 'prop-types';

function simulateBattle(attacker: UserModel, defender: UserModel, attackTurns: number): any {
  let results: any = {};
  let attackerLosses: any = {};
  let defenderLosses: any = {};
  let totalAttackerLosses = 0;
  let totalDefenderLosses = 0;

  // Helper function to calculate total bonus for a unit
  const calculateTotalBonus = (unit: PlayerUnit, items: PlayerItem[]): number => {
    let bonus = 0;

    // Get base bonus from the Unit's data
    const unitData = UnitTypes.find(u => u.type === unit.type && u.level === unit.level);
    if (unitData) {
      bonus += unitData.bonus;
    }

    for (let item of items) {
      if (item.unitType === unit.type && item.level === unit.level) {
        // Get bonus from the Weapon's data
        const weaponData = WeaponTypes.find(w => w.usage === item.unitType && w.type === item.type && w.level === item.level);
        if (weaponData) {
          bonus += weaponData.bonus * item.quantity;
        }
      }
    }
    return bonus;
  };

  for (let attUnit of attacker.units) {
    for (let defUnit of defender.units) {
      if (attUnit.quantity <= 0 || defUnit.quantity <= 0) {
        continue;
      }

      if (attUnit.type !== "OFFENSE" || defUnit.type !== "DEFENSE") {
        continue;
      }

      let attTotalBonus = calculateTotalBonus(attUnit, attacker.items);
      let defTotalBonus = calculateTotalBonus(defUnit, defender.items);

      // Calculate the proportion of losses considering weapon bonuses and multiply by the number of attackTurns
      let attLoss = attackTurns * (Math.random() * 0.1 + 0.1) * (defTotalBonus * defUnit.quantity) / (attTotalBonus * attUnit.quantity + 1);
      let defLoss = attackTurns * (Math.random() * 0.1 + 0.1) * (attTotalBonus * attUnit.quantity) / (defTotalBonus * defUnit.quantity + 1);

      // Calculate the actual losses
      let attUnitLoss = Math.min(attUnit.quantity, Math.round(attLoss * attUnit.quantity));
      let defUnitLoss = Math.min(defUnit.quantity, Math.round(defLoss * defUnit.quantity));

      // Apply the losses
      attUnit.quantity -= attUnitLoss;
      defUnit.quantity -= defUnitLoss;

      // Store the losses in the dictionary
      attackerLosses[`${attUnit.type}-${attUnit.level}`] = (attackerLosses[`${attUnit.type}-${attUnit.level}`] || 0) + attUnitLoss;
      defenderLosses[`${defUnit.type}-${defUnit.level}`] = (defenderLosses[`${defUnit.type}-${defUnit.level}`] || 0) + defUnitLoss;

      // Accumulate the total losses
      totalAttackerLosses += attUnitLoss;
      totalDefenderLosses += defUnitLoss;
    }
  }

  // Adjust for CITIZEN or WORKER losses on the defender's side
  if (defender.fortHitpoints <= 0 || !defender.units.some(unit => unit.type === "DEFENSE" && unit.quantity > 0)) {
    const civilianUnits = ["CITIZEN", "WORKER"];
    for (let civUnitType of civilianUnits) {
      const civUnit = defender.units.find(unit => unit.type === civUnitType);
      if (civUnit && civUnit.quantity > 0) {
        let loss = attackTurns * Math.round(civUnit.quantity * (Math.random() * 0.1 + 0.05));
        civUnit.quantity -= loss;
        defenderLosses[`${civUnitType}-${civUnit.level}`] = (defenderLosses[`${civUnitType}-${civUnit.level}`] || 0) + loss;
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
  const startTurns = AttackPlayer.attackTurns;
  let GoldPerTurn = 0.8 / 10;
  // Fetch max HP for the defender's fort level
  const maxFortHP = Fortifications[DefensePlayer.fortLevel].hitpoints;

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
  // Calculate the fort damage and round it to the nearest integer
  const calculatedFortDmg = Math.round(maxFortHP * DmgPerTurn * attack_turns);
  const maxFortDmg = Math.min(DefensePlayer.fortHitpoints * DmgPerTurn * attack_turns, 40);
  const battleResults = simulateBattle(AttackPlayer, DefensePlayer, attack_turns);

  if (DefensePlayer.fortHitpoints <= 0) {
    GoldPerTurn *= 1.05;
  }

  const isAttackerWinner = AttackPlayer.offense > DefensePlayer.defense;
  const pillagedGold = DefensePlayer.gold * GoldPerTurn * attack_turns;

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

  console.log('Before update:', DefensePlayer.fortHitpoints, defender.fort_hitpoints, maxFortDmg);
  DefensePlayer.fortHitpoints -= Math.max(defender.fort_hitpoints - maxFortDmg, 0);
  console.log('After update:', DefensePlayer.fortHitpoints);

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
        startTurns: startTurns,
        endTurns: AttackPlayer.attackTurns,
        offensePoints: AttackPlayer.offense,
        defensePoints: DefensePlayer.defense,
        pillagedGold: isAttackerWinner ? pillagedGold : 0,
        fortDamage: maxFortDmg,
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
      'fortDmg': maxFortDmg,
      'offenseToDefenseRatio': scaledOffenseToDefenseRatio,
      'DmgPerTurn': DmgPerTurn,
      'BattleResults': battleResults
    }
  };
  return { status: 'failed' };
}
