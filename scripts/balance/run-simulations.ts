import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Fortifications } from '@/constants';
import UserModel from '@/models/Users';
import { simulateBattle } from '@/utils/attackFunctions';
import { logInfo } from '@/utils/logger';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';
import {
  CITIZEN_WORKERS_TARGET,
  simulateAssassination,
  simulateInfiltration,
  simulateIntel,
} from '@/utils/spyFunctions';

type BattleProfile = {
  level: number;
  offense: number;
  defense: number;
  citizen: number;
  worker: number;
  fortLevel: number;
  gold: bigint;
};

type SpyProfile = {
  level: number;
  spyL1: number;
  spyL2: number;
  spyL3: number;
  sentryL1: number;
  sentryL2: number;
  defense: number;
  citizen: number;
  worker: number;
  fortLevel: number;
};

const REPEATS = 400;

function fortHitpointsForLevel(level: number): number {
  const fort = Fortifications.find((item) => item.level === level);
  return fort?.hitpoints ?? 50;
}

function createBattleUser(profile: BattleProfile): UserModel {
  const generator = new MockUserGenerator();
  generator
    .setLevel(profile.level)
    .setFortLevel(profile.fortLevel)
    .setFortHitpoints(fortHitpointsForLevel(profile.fortLevel))
    .adjustGold(profile.gold - BigInt(25000))
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades()
    .addUnits([
      {
        id: 0,
        userId: 1,
        type: 'OFFENSE',
        level: 1,
        quantity: profile.offense,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'DEFENSE',
        level: 1,
        quantity: profile.defense,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'CITIZEN',
        level: 1,
        quantity: profile.citizen,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'WORKER',
        level: 1,
        quantity: profile.worker,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'SPY',
        level: 1,
        quantity: 10,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'SENTRY',
        level: 1,
        quantity: 10,
        isMercenary: false,
      },
    ]);

  return new UserModel(generator.getUser() as any);
}

function createSpyUser(profile: SpyProfile): UserModel {
  const generator = new MockUserGenerator();
  generator
    .setLevel(profile.level)
    .setFortLevel(profile.fortLevel)
    .setFortHitpoints(fortHitpointsForLevel(profile.fortLevel))
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades()
    .setSpyUpgrade(profile.fortLevel)
    .setSentryUpgrade(profile.fortLevel)
    .addUnits([
      {
        id: 0,
        userId: 1,
        type: 'SPY',
        level: 1,
        quantity: profile.spyL1,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'SPY',
        level: 2,
        quantity: profile.spyL2,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'SPY',
        level: 3,
        quantity: profile.spyL3,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'SENTRY',
        level: 1,
        quantity: profile.sentryL1,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'SENTRY',
        level: 2,
        quantity: profile.sentryL2,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'DEFENSE',
        level: 1,
        quantity: profile.defense,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'CITIZEN',
        level: 1,
        quantity: profile.citizen,
        isMercenary: false,
      },
      {
        id: 0,
        userId: 1,
        type: 'WORKER',
        level: 1,
        quantity: profile.worker,
        isMercenary: false,
      },
    ]);

  return new UserModel(generator.getUser() as any);
}

async function runBattleMirrorSimulation() {
  let attackerWins = 0;
  let totalPillage = BigInt(0);
  let totalAttackerLosses = 0;
  let totalDefenderLosses = 0;

  for (let i = 0; i < REPEATS; i += 1) {
    const attacker = createBattleUser({
      level: 20,
      offense: 1000,
      defense: 800,
      citizen: 1600,
      worker: 900,
      fortLevel: 6,
      gold: BigInt(500000),
    });
    const defender = createBattleUser({
      level: 20,
      offense: 1000,
      defense: 800,
      citizen: 1600,
      worker: 900,
      fortLevel: 6,
      gold: BigInt(500000),
    });
    const random = createSeededRandom(`battle-mirror-${i}`);
    const result = await simulateBattle(
      attacker as any,
      defender as any,
      defender.fortHitpoints,
      15,
      false,
      false,
      { random },
    );
    if (result.result === 'WIN') attackerWins += 1;
    totalPillage += result.pillagedGold || BigInt(0);
    totalAttackerLosses += Number(result.Losses?.Attacker?.total || 0);
    totalDefenderLosses += Number(result.Losses?.Defender?.total || 0);
  }

  return {
    repeats: REPEATS,
    attackerWinRate: Number((attackerWins / REPEATS).toFixed(4)),
    avgPillageGold: Number(totalPillage / BigInt(REPEATS)),
    avgAttackerLosses: Number((totalAttackerLosses / REPEATS).toFixed(2)),
    avgDefenderLosses: Number((totalDefenderLosses / REPEATS).toFixed(2)),
  };
}

function runSpySimulation() {
  let intelSuccess = 0;
  let infiltrateSuccess = 0;
  let assassinateSuccess = 0;
  let totalIntelSpyLosses = 0;
  let totalInfiltrationFortDamage = 0;
  let totalAssassinationKills = 0;

  for (let i = 0; i < REPEATS; i += 1) {
    const random = createSeededRandom(`spy-${i}`);
    const attacker = createSpyUser({
      level: 20,
      spyL1: 1200,
      spyL2: 800,
      spyL3: 700,
      sentryL1: 300,
      sentryL2: 300,
      defense: 400,
      citizen: 1800,
      worker: 1200,
      fortLevel: 6,
    });
    const defender = createSpyUser({
      level: 20,
      spyL1: 500,
      spyL2: 400,
      spyL3: 300,
      sentryL1: 900,
      sentryL2: 900,
      defense: 1000,
      citizen: 2200,
      worker: 1500,
      fortLevel: 6,
    });

    const intelResult = simulateIntel(attacker as any, defender as any, 6, {
      random,
    });
    const infiltrationResult = simulateInfiltration(
      attacker as any,
      defender as any,
      5,
      { random },
    );
    const assassinationResult = simulateAssassination(
      attacker as any,
      defender as any,
      4,
      CITIZEN_WORKERS_TARGET as any,
      { random },
    );

    if (intelResult?.success) intelSuccess += 1;
    if (infiltrationResult?.success) infiltrateSuccess += 1;
    if (assassinationResult?.success) assassinateSuccess += 1;

    totalIntelSpyLosses += Number(intelResult?.spiesLost || 0);
    totalInfiltrationFortDamage += Number(infiltrationResult?.fortDmg || 0);
    totalAssassinationKills += Number(assassinationResult?.unitsKilled || 0);
  }

  return {
    repeats: REPEATS,
    intelSuccessRate: Number((intelSuccess / REPEATS).toFixed(4)),
    infiltrateSuccessRate: Number((infiltrateSuccess / REPEATS).toFixed(4)),
    assassinateSuccessRate: Number((assassinateSuccess / REPEATS).toFixed(4)),
    avgIntelSpyLosses: Number((totalIntelSpyLosses / REPEATS).toFixed(2)),
    avgInfiltrationFortDamage: Number(
      (totalInfiltrationFortDamage / REPEATS).toFixed(2),
    ),
    avgAssassinationKills: Number(
      (totalAssassinationKills / REPEATS).toFixed(2),
    ),
  };
}

async function main() {
  const battle = await runBattleMirrorSimulation();
  const spy = runSpySimulation();

  const report = {
    generatedAt: new Date().toISOString(),
    seedScheme: 'createSeededRandom(label-index)',
    battle,
    spy,
  };

  const outputDir = path.resolve(process.cwd(), 'scripts/balance/output');
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'latest-simulation-summary.json');
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');

  logInfo('Balance simulation summary', report);
}

main().catch((error) => {
  throw error;
});
