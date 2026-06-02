export interface UnitCounts {
  soldier: number;
  knight: number;
  berserker: number;
  guard: number;
  archer: number;
  royalGuard: number;
  spy: number;
  infiltrator: number;
  assassin: number;
  sentry: number;
  sentinel: number;
  inquisitor: number;
  citizen: number;
  worker: number;
}

export interface ItemStats {
  meleeAtk: number;
  meleeDef: number;
  rangedAtk: number;
  rangedDef: number;
}

export interface UpgradeLevels {
  offense: number;
  defense: number;
}

export interface SimPlayer {
  id: string;
  displayName: string;
  level: number;
  xp?: number;
  houseLevel?: number;
  race?: string;
  playerClass?: string;
  gold: number;
  units: UnitCounts;
  items: ItemStats;
  upgrades: UpgradeLevels;
  fortLevel: number;
  fortHp: number;
  stamina?: number;
  defensePressureToday?: number;
  bonuses: {
    attack: number;
    defense: number;
  };
}

export interface BattleConfig {
  attackerMultiplier?: number;
  defenderCounterMultiplier?: number;
  maxPillageShare?: number;
  damageVarianceMin?: number;
  damageVarianceMax?: number;
  maxTurns?: number;
  isDefenderProtected?: boolean;
  random?: () => number;
}

export interface BalanceParameters {
  attackerDamageMultiplier: number;
  defenderCounterDamageMultiplier: number;
  maxPillageSharePerAttack: number;
  damageVarianceMin: number;
  damageVarianceMax: number;
}

export interface BattleMetrics {
  winner: 'attacker' | 'defender' | 'draw';
  turns: number;
  attackerCasualties: UnitCounts;
  defenderCasualties: UnitCounts;
  fortDamage: number;
  loot: number;
  attackerRoi: number;
  attackerXp: number;
  defenderXp: number;
  attackerUnitsRemaining: UnitCounts;
  defenderUnitsRemaining: UnitCounts;
}

export interface SimulationResults {
  gamesPlayed: number;
  attackerWinRate: number;
  defenderWinRate: number;
  drawRate: number;
  avgAttackerCasualtiesPercent: number;
  avgDefenderCasualtiesPercent: number;
  avgFortDamage: number;
  avgFortDamagePercent: number;
  avgLoot: number;
  avgAttackerRoi: number;
  avgTurns: number;
}

export interface PlayerConfig {
  id?: string;
  displayName?: string;
  level: number;
  xp?: number;
  houseLevel?: number;
  race?: string;
  playerClass?: string;
  gold: number;
  units?: Partial<UnitCounts>;
  items?: Partial<ItemStats>;
  upgrades?: Partial<UpgradeLevels>;
  fortLevel?: number;
  fortHp?: number;
  stamina?: number;
  defensePressureToday?: number;
  bonuses?: Partial<SimPlayer['bonuses']>;
}

// ============================================================
// Population Simulation Types
// ============================================================

export type PlayStyle =
  | 'aggressive'
  | 'defensive'
  | 'balanced'
  | 'economist'
  | 'spy-focused';

export type TurnStrategy = 'conservative' | 'balanced' | 'aggressive';
export type StrategicGoal =
  | 'wealth'
  | 'dominance'
  | 'growth'
  | 'defense'
  | 'retaliation';

export type TargetMotivation =
  | 'loot'
  | 'retaliation'
  | 'repeat-farm'
  | 'dominance'
  | 'xp'
  | 'opportunistic';

export interface BehaviorParams {
  aggression: number;
  riskTolerance: number;
  activityLevel: number;
  wealthPreference: number;
  spyPreference: number;
  turnStrategy: TurnStrategy;
  playStyle: PlayStyle;
  primaryGoal: StrategicGoal;
}

export interface DailyLimits {
  attacksUsed: number;
  intelUsed: number;
  assassinationUsed: number;
  infiltrationUsed: number;
}

export interface IntelPayload {
  units: UnitCounts;
  fortLevel: number;
  fortHp: number;
  fortMaxHp: number;
  gold: number;
  defenseBonus: number;
  spyLevel: number;
  sentryLevel: number;
}

export interface IntelResult {
  success: boolean;
  day: number;
  defenderInfo?: IntelPayload;
  spyCasualties: number;
  spiesSent: number;
}

export interface SpyResult {
  mission: 'intel' | 'assassination' | 'infiltration';
  success: boolean;
  turns?: number;
  intel?: IntelPayload;
  targetCasualties?: number;
  fortDamage?: number;
  spyCasualties: number;
  spiesSent: number;
}

export interface TargetEvaluation {
  playerId: string;
  gold: number;
  intelAvailable: boolean;
  intel?: IntelResult;
  estimatedWinRate: number;
  estimatedLoot: number;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  recommendedTurns: number;
  priority: number;
  motivation: TargetMotivation;
  shouldScout: boolean;
  intelAge?: number;
  intelFreshness: 'fresh' | 'decaying' | 'expired' | 'none';
  recentlyAttackedByTarget: boolean;
  previouslyAttackedTarget: boolean;
}

export interface AttackDecision {
  target: string;
  turns: number;
  reason: string;
}

export interface AgentDecision {
  intelMissions: { target: string; spyCount: number }[];
  attacks: AttackDecision[];
  recruitment: Partial<UnitCounts>;
  upgradeSpy?: boolean;
  upgradeSentry?: boolean;
  upgradeEconomy?: boolean;
  repairFort?: number;
  bankGold?: number;
}

export interface PlayerState {
  id: string;
  displayName: string;
  level: number;
  xp: number;
  houseLevel: number;
  race?: string;
  playerClass?: string;
  gold: number;
  goldInBank: number;
  attackTurns: number;
  stamina: number;
  maxStamina: number;
  defensePressureToday: number;
  spyPressureToday: number;
  units: UnitCounts;
  items: ItemStats;
  upgrades: UpgradeLevels;
  fortLevel: number;
  fortHp: number;
  fortMaxHp: number;
  spyLevel: number;
  sentryLevel: number;
  economyLevel: number;
  bonuses: {
    attack: number;
    defense: number;
    spy: number;
    sentry: number;
  };
  recruitBonus: number;
  maximumBankDeposits: number;
  dailyLimits: DailyLimits;
  behavior: BehaviorParams;
  intelCache: Map<string, IntelResult>;
  attackHistory: Map<string, number[]>;
  incomingAttackHistory: Map<string, number[]>;
  targetMemory: Map<
    string,
    {
      attacks: number;
      wins: number;
      lastLoot: number;
      lastAttackTick: number;
    }
  >;
  bankDepositHistory: number[];
  status: 'active' | 'inactive' | 'defeated';
}

export interface DayResult {
  day: number;
  totalAttacks: number;
  totalIntelMissions: number;
  totalAssassinations: number;
  totalInfiltrations: number;
  intelSuccessRate: number;
  attackerWinRate: number;
  defenderWinRate: number;
  drawRate: number;
  avgTurnsPerAttack: number;
  totalLootTransferred: number;
  totalAttackerCasualties: number;
  totalDefenderCasualties: number;
  levelUps: number;
  playersDefeated: number;
  avgFortDamage: number;
  lowTurnAttacks: number;
  highTurnAttacks: number;
  attackTurnsGenerated: number;
  attackTurnsSpent: number;
  totalTurnIncome: number;
  totalBankDeposits: number;
  fortBreaches: number;
  breachedPlayersEndOfDay: number;
}

export interface PopulationMetrics {
  dailyResults: DayResult[];
  attackerWinRateOverTime: number[];
  defenderWinRateOverTime: number[];
  intelSuccessRateOverTime: number[];
  intelToAttackConversionRate: number[];
  totalGoldInEconomy: number[];
  wealthGiniCoefficient: number[];
  levelDistributionOverTime: Map<number, number>[];
  avgUnitsPerPlayer: number[];
  powerCreepIndex: number[];
  avgTurnsPerAttack: number[];
  attacksPerActivePlayer: number[];
  lowTurnVsHighTurnRatio: number[];
  activePlayersPerDay: number[];
  defeatedPlayersPerDay: number[];
  breachedPlayersPerDay: number[];
  attackTurnsHeldPerDay: number[];
}

export interface SimulationConfig {
  seed?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
  metricsInterval?: number;
  random?: () => number;
  balance?: Partial<BalanceParameters>;
  turnIntervalMinutes?: number;
  attackLevelRange?: number;
}

export interface BalanceIterationReport {
  iteration: number;
  daysSimulated: number;
  maxLevelReached: number;
  avgAttacksPerDay: number;
  avgIntelSuccessRate: number;
  avgAttackerWinRate: number;
  avgLootPerDay: number;
  staleScore: number;
  notes: string[];
  adjustments: Partial<BalanceParameters>;
  heuristicChanges?: string[];
  topPlayers?: TopPlayerSnapshot[];
}

export interface TopPlayerSnapshot {
  id: string;
  displayName: string;
  level: number;
  gold: number;
  goldInBank: number;
  status: PlayerState['status'];
  power: number;
}

export interface TopPlayerTimelinePoint {
  iteration: number;
  level: number;
  gold: number;
  goldInBank: number;
  status: PlayerState['status'];
  power: number;
}

export interface PersonaComparisonResult {
  persona: string;
  stopReason: AutonomousRunResult['stopReason'];
  finalBalance: Partial<BalanceParameters>;
  finalMaxLevel: number;
  avgAttacksPerDay: number;
  avgAttackerWinRate: number;
  avgIntelSuccessRate: number;
}

export interface AutonomousRunArtifact {
  generatedAt: string;
  persona: string;
  stopReason: AutonomousRunResult['stopReason'];
  finalBalance: Partial<BalanceParameters>;
  reports: BalanceIterationReport[];
  dailyResults: DayResult[];
  finalPopulation: TopPlayerSnapshot[];
  topPlayerTimelines: Record<string, TopPlayerTimelinePoint[]>;
}

export interface AutonomousRunResult {
  finalState: SimulationState;
  reports: BalanceIterationReport[];
  stopReason: 'level_100' | 'stale_meta' | 'iteration_limit';
  finalBalance: Partial<BalanceParameters>;
  persona?: string;
  artifact?: AutonomousRunArtifact;
}

export interface BalanceObjectiveTargets {
  attacksPerActivePlayerDay: [number, number];
  highTurnAttackShare: [number, number];
  attackerWinRate: [number, number];
  lootToProductionRatio: [number, number];
  fortBreachRate: [number, number];
  goldGini: [number, number];
  averageHeldTurns: [number, number];
}

export interface ClosedLoopMetrics {
  daysSimulated: number;
  activePlayers: number;
  totalAttacks: number;
  attacksPerActivePlayerDay: number;
  highTurnAttackShare: number;
  attackerWinRate: number;
  avgTurnsPerAttack: number;
  lootToProductionRatio: number;
  fortBreachRate: number;
  avgLootPerAttack: number;
  avgLootPerDay: number;
  avgBankDepositsPerDay: number;
  goldGini: number;
  averageHeldTurns: number;
  maxLevel: number;
  avgLevel: number;
}

export interface ClosedLoopScoreComponent {
  metric: keyof ClosedLoopMetrics;
  value: number;
  target: [number, number];
  weight: number;
  penalty: number;
}

export interface ClosedLoopDiagnosis {
  severity: 'info' | 'warn' | 'critical';
  code: string;
  message: string;
}

export interface ClosedLoopCandidateResult {
  label: string;
  balance: BalanceParameters;
  metrics: ClosedLoopMetrics;
  score: number;
  scoreComponents: ClosedLoopScoreComponent[];
  diagnoses: ClosedLoopDiagnosis[];
}

export interface ClosedLoopIterationReport {
  iteration: number;
  accepted: boolean;
  baseline: ClosedLoopCandidateResult;
  selected: ClosedLoopCandidateResult;
  candidates: ClosedLoopCandidateResult[];
  notes: string[];
}

export interface ClosedLoopBalanceConfig {
  populationSize?: number;
  levelRange?: [number, number];
  daysPerIteration?: number;
  maxIterations?: number;
  seed?: number;
  simulation?: SimulationConfig;
  startingBalance?: Partial<BalanceParameters>;
  targets?: Partial<BalanceObjectiveTargets>;
  onProgress?: (event: ClosedLoopProgressEvent) => void;
}

export type ClosedLoopProgressEvent =
  | {
      type: 'start';
      totalIterations: number;
      populationSize: number;
      daysPerIteration: number;
      candidateCountEstimate: number;
      timestamp: string;
    }
  | {
      type: 'iteration_start';
      iteration: number;
      totalIterations: number;
      balance: BalanceParameters;
      timestamp: string;
    }
  | {
      type: 'candidate_start';
      iteration: number;
      totalIterations: number;
      candidateIndex: number;
      candidateCount: number;
      label: string;
      balance: BalanceParameters;
      timestamp: string;
    }
  | {
      type: 'candidate_complete';
      iteration: number;
      totalIterations: number;
      candidateIndex: number;
      candidateCount: number;
      label: string;
      elapsedMs: number;
      score: number;
      metrics: ClosedLoopMetrics;
      diagnoses: ClosedLoopDiagnosis[];
      timestamp: string;
    }
  | {
      type: 'iteration_complete';
      iteration: number;
      totalIterations: number;
      elapsedMs: number;
      accepted: boolean;
      selectedLabel: string;
      baselineScore: number;
      selectedScore: number;
      finalScore: number;
      balance: BalanceParameters;
      diagnoses: ClosedLoopDiagnosis[];
      timestamp: string;
    }
  | {
      type: 'complete';
      elapsedMs: number;
      finalScore: number;
      finalBalance: BalanceParameters;
      finalMetrics: ClosedLoopMetrics;
      timestamp: string;
    };

export type ClosedLoopProgressPayload =
  ClosedLoopProgressEvent extends infer Event
    ? Event extends unknown
      ? Omit<Event, 'timestamp'>
      : never
    : never;

export interface ClosedLoopBalanceArtifact {
  generatedAt: string;
  config: Required<
    Omit<
      ClosedLoopBalanceConfig,
      'simulation' | 'startingBalance' | 'targets' | 'onProgress'
    >
  > & {
    simulation: SimulationConfig;
    startingBalance: BalanceParameters;
    targets: BalanceObjectiveTargets;
  };
  finalBalance: BalanceParameters;
  finalMetrics: ClosedLoopMetrics;
  finalScore: number;
  iterations: ClosedLoopIterationReport[];
  finalPopulation: TopPlayerSnapshot[];
}

export interface ClosedLoopBalanceResult {
  finalState: SimulationState;
  finalBalance: BalanceParameters;
  finalMetrics: ClosedLoopMetrics;
  finalScore: number;
  iterations: ClosedLoopIterationReport[];
  artifact: ClosedLoopBalanceArtifact;
}

export interface SimulationState {
  players: Map<string, PlayerState>;
  day: number;
  totalDays: number;
  history: DayResult[];
  metrics: PopulationMetrics;
  config: SimulationConfig;
}
