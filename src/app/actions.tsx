import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';

export async function attackHandler(attackerId, defenderId, attack_turns) {
  'use server';

  const attacker: UserModel = await prisma?.users.findUnique({
    where: { id: attackerId },
  });
  const defender: UserModel = await prisma?.users.findUnique({
    where: { id: defenderId },
  });
  if (attacker && defender) {
    const AttackPlayer = new UserModel(attacker);
    const DefensePlayer = new UserModel(defender);

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

    let fortDamagePercentage = 0;
    const offenseToDefenseRatio = AttackPlayer.offense / DefensePlayer.defense;
    if (offenseToDefenseRatio >= 0.9) fortDamagePercentage = 0.1;
    if (offenseToDefenseRatio >= 1.2) fortDamagePercentage = 0.2;
    if (offenseToDefenseRatio >= 1.4) fortDamagePercentage = 0.4;
    if (offenseToDefenseRatio >= 1.6) fortDamagePercentage = 0.6;
    if (offenseToDefenseRatio >= 1.8) fortDamagePercentage = 0.8;
    if (offenseToDefenseRatio >= 2) fortDamagePercentage = 1;

    const DmgPerTurn = fortDamagePercentage / 10;

    if (DefensePlayer.fortHitpoints <= 0) {
      GoldPerTurn *= 1.05;
    }

    const isAttackerWinner = AttackPlayer.offense > DefensePlayer.defense;

    // Adjust defender's gold based on GoldPerTurn
    const pillagedGold = DefensePlayer.gold * GoldPerTurn * attack_turns;

    if (isAttackerWinner) {
      DefensePlayer.gold -= pillagedGold;
      AttackPlayer.gold += pillagedGold;

      // Update bank_history for pillage
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

    // Adjust defender's fortHitpoints based on DmgPerTurn
    const fortDmg = DefensePlayer.fortHitpoints * DmgPerTurn * attack_turns;
    DefensePlayer.fortHitpoints -= fortDmg;
    // Update the database with the new values (not shown in this code)

    const BaseXP = 1000;
    const LevelDifference = DefensePlayer.level - AttackPlayer.level;
    const LevelDifferenceBonus =
      LevelDifference > 0 ? LevelDifference * 0.05 * BaseXP : 0;
    const FortDestructionBonus =
      DefensePlayer.fortHitpoints <= 0 ? 0.5 * BaseXP : 0;
    const TurnsUsedMultiplier = attack_turns / 10;

    // Calculate XP gained from this attack
    let XP = BaseXP + LevelDifferenceBonus + FortDestructionBonus;
    XP *= TurnsUsedMultiplier;

    // Calculate MaxXP for reference
    // const MaxXP = (BaseXP + 5 * 0.05 * BaseXP + 0.5 * BaseXP) * TurnsUsedMultiplier;

    // Add the XP to the attacker's experience
    AttackPlayer.experience += XP;

    // Check if the attacker has leveled up
    /* for (let i = AttackPlayer.level + 1; i <= 16; i++) {
      if (AttackPlayer.experience >= Levels[i]) {
        AttackPlayer.level = i;
      } else {
        break;
      }
    } */

    // Update the attack_log
    const attack_log = await prisma.attack_log.create({
      data: {
        attacker_id: attackerId,
        defender_id: defenderId,
        timestamp: new Date().toISOString(),
        winner: isAttackerWinner ? attackerId : defenderId,
        stats: {
          offensePoints: AttackPlayer.offense,
          defensePoints: DefensePlayer.defense,
          pillagedGold: isAttackerWinner ? pillagedGold : 0,
          fortDamage: fortDmg,
          xpEarned: XP,
          turns: attack_turns,
        },
      },
    });

    // Update the users in the database with the new values
    await prisma.users.update({
      where: { id: attackerId },
      data: {
        gold: AttackPlayer.gold,
        attack_turns,
        experience: AttackPlayer.experience,
        // level: AttackPlayer.level,
      },
    });
    await prisma.users.update({
      where: { id: defenderId },
      data: {
        gold: DefensePlayer.gold,
        fort_hitpoints: DefensePlayer.fortHitpoints,
      },
    });
    return {
      status: 'success',
      result: isAttackerWinner,
      attacker: AttackPlayer,
      defender: DefensePlayer,
      attack_log: attack_log.id,
    };
  }
  return { status: 'failed' };
}
