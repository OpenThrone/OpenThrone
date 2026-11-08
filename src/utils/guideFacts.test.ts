import { describe, expect, it } from 'bun:test';

import { RUNTIME_SETTING_REGISTRY } from '@/constants/runtimeSettings';
import { EconomyUpgrades } from '@/constants/Structure_Upgrades';
import { UnitTypes } from '@/constants/Units';
import { DEFAULT_ERA_START_SETTINGS } from '@/utils/eraStartSettings';
import { buildGuideFacts, GUIDE_EXAMPLE_WORKERS } from '@/utils/guideFacts';
import { staminaCost } from '@/utils/stamina';
import { getGameDayMinutes } from '@/utils/timefunctions';

describe('public guide figures', () => {
  it('reads unit costs and income from the game constants', () => {
    const facts = buildGuideFacts();
    const worker = UnitTypes.find((unit) => unit.type === 'WORKER');
    expect(facts.costs.worker).toBe(worker?.cost);
    expect(facts.income.farmPerWorker).toBe(EconomyUpgrades[0].goldPerWorker);
    expect(facts.start.gold).toBe(Number(DEFAULT_ERA_START_SETTINGS.gold));
    expect(facts.startBuys.workers).toBe(
      Math.floor(facts.start.gold / facts.costs.worker),
    );
  });

  it('derives payback and the worked income example from those figures', () => {
    const { income, costs, turnMinutes, turnsPerDay } = buildGuideFacts();
    expect(income.workerPaybackTurns).toBe(
      Math.ceil(costs.worker / income.farmPerWorker),
    );
    expect(income.workerPaybackHours).toBe(
      (income.workerPaybackTurns * turnMinutes) / 60,
    );
    expect(income.examplePerTurn).toBe(
      GUIDE_EXAMPLE_WORKERS * income.farmPerWorker + income.manorPerTurn,
    );
    expect(income.examplePerDay).toBe(income.examplePerTurn * turnsPerDay);
    expect(turnsPerDay * turnMinutes).toBe(getGameDayMinutes());
  });

  it('falls back to the registry defaults until the live config loads', () => {
    const facts = buildGuideFacts();
    expect(facts.recruitDailyCap).toBe(
      RUNTIME_SETTING_REGISTRY['recruit.internalDailyCap'].fallback,
    );
    expect(facts.protection.days).toBe(
      RUNTIME_SETTING_REGISTRY['era.protectionDurationDays'].fallback,
    );
    expect(facts.combat.levelRange).toBe(
      RUNTIME_SETTING_REGISTRY.ATTACK_LEVEL_RANGE.fallback,
    );
    expect(facts.combat.pairDailyLimit).toBe(
      RUNTIME_SETTING_REGISTRY['combat.pairDailyLimit'].fallback,
    );
  });

  it('uses the live server settings when they are supplied', () => {
    const facts = buildGuideFacts({
      recruitDailyCap: 40,
      protectionDurationDays: 7,
      protectionLevelLimit: 12,
      depositCapPercent: 60,
      attackLevelRange: 3,
      pairDailyLimit: 2,
      stamina: {
        penaltyThreshold: 40,
        minOffensePercent: 70,
        enabled: true,
        recoveryEnabled: true,
        recoveryAmount: 10,
        recoveryIntervalMinutes: 15,
        baseCost: 4,
        perTurnCost: 1,
      },
    });
    expect(facts.recruitDailyCap).toBe(40);
    expect(facts.protection.days).toBe(7);
    expect(facts.protection.level).toBe(12);
    expect(facts.bank.capPercent).toBe(60);
    expect(facts.combat.levelRange).toBe(3);
    expect(facts.combat.pairDailyLimit).toBe(2);
    expect(facts.stamina.base).toBe(4);
    expect(facts.stamina.example).toBe(14);
    expect(facts.stamina.singlesExample).toBe(
      staminaCost(1, {
        penaltyThreshold: 40,
        minOffensePercent: 70,
        enabled: true,
        recoveryEnabled: true,
        recoveryAmount: 10,
        recoveryIntervalMinutes: 15,
        baseCost: 4,
        perTurnCost: 1,
      }) * 10,
    );
  });

  it('lists every economy upgrade in the reference table', () => {
    const { tables } = buildGuideFacts();
    expect(tables.economy).toHaveLength(EconomyUpgrades.length);
    expect(tables.economy[0]).toMatchObject({ index: 0, goldPerWorker: 50 });
  });
});
