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

    const offenseToDefenseRatio = AttackPlayer.offense / (DefensePlayer.defense || 1);
    const scaledOffenseToDefenseRatio = Math.min(Math.max(offenseToDefenseRatio, 0), 2);
    let fortDamagePercentage = 0.1 * scaledOffenseToDefenseRatio;

    const modifiedFortDamagePercentage = fortDamagePercentage * (0.5 + scaledOffenseToDefenseRatio / 4);
    const DmgPerTurn = modifiedFortDamagePercentage / 10;
    const maxFortDmg = Math.min(DefensePlayer.fortHitpoints * DmgPerTurn * attack_turns, 40);

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

    DefensePlayer.fortHitpoints -= maxFortDmg;

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
          offensePoints: AttackPlayer.offense,
          defensePoints: DefensePlayer.defense,
          pillagedGold: isAttackerWinner ? pillagedGold : 0,
          fortDamage: maxFortDmg,
          xpEarned: XP,
          turns: attack_turns,
        },
      },
    });

    await prisma.users.update({
      where: { id: attackerId },
      data: {
        gold: AttackPlayer.gold,
        attack_turns: AttackPlayer.attackTurns - attack_turns,
        experience: AttackPlayer.experience,
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
      extra_variables: {
        'pillagedGold': pillagedGold,
        'XP': XP,
        'GoldPerTurn': GoldPerTurn,
        'levelDifference': levelDifference,
        'fortDamagePercentage': modifiedFortDamagePercentage,
        'fortDmg': maxFortDmg,
        'offenseToDefenseRatio': scaledOffenseToDefenseRatio,
        'DmgPerTurn': DmgPerTurn,
      }
    };
  }
  return { status: 'failed' };
}
