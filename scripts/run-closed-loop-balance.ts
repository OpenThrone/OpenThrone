import { mkdir } from 'node:fs/promises';

import type { ClosedLoopDiagnosis, ClosedLoopProgressEvent } from '../src/sim';
import { runClosedLoopBalance } from '../src/sim';

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDiagnoses(diagnoses: ClosedLoopDiagnosis[]): string {
  return diagnoses
    .filter((diagnosis) => diagnosis.severity !== 'info')
    .map((diagnosis) => diagnosis.code)
    .slice(0, 3)
    .join(', ');
}

function logProgress(event: ClosedLoopProgressEvent): void {
  if (event.type === 'start') {
    console.log(
      `[closed-loop] start: iterations=${event.totalIterations}, population=${event.populationSize}, days/iteration=${event.daysPerIteration}`,
    );
    return;
  }

  if (event.type === 'iteration_start') {
    console.log(
      `[closed-loop] iteration ${event.iteration}/${event.totalIterations} starting`,
    );
    return;
  }

  if (event.type === 'candidate_start') {
    if (event.label === 'current' && event.candidateCount === 1) {
      console.log(
        `[closed-loop] iteration ${event.iteration}/${event.totalIterations}, baseline: current`,
      );
      return;
    }
    console.log(
      `[closed-loop] iteration ${event.iteration}/${event.totalIterations}, candidate ${event.candidateIndex}/${event.candidateCount}: ${event.label}`,
    );
    return;
  }

  if (event.type === 'candidate_complete') {
    const diagnoses = formatDiagnoses(event.diagnoses);
    console.log(
      [
        `[closed-loop] candidate done: ${event.label}`,
        `score=${event.score.toFixed(3)}`,
        `elapsed=${fmtMs(event.elapsedMs)}`,
        `attacks/player/day=${event.metrics.attacksPerActivePlayerDay.toFixed(2)}`,
        `win=${pct(event.metrics.attackerWinRate)}`,
        `high-turn=${pct(event.metrics.highTurnAttackShare)}`,
        `loot/prod=${event.metrics.lootToProductionRatio.toFixed(2)}`,
        diagnoses ? `diagnoses=${diagnoses}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
    );
    return;
  }

  if (event.type === 'iteration_complete') {
    const action = event.accepted ? 'accepted' : 'kept current';
    console.log(
      `[closed-loop] iteration ${event.iteration}/${event.totalIterations} complete: ${action} ${event.selectedLabel}, score=${event.finalScore.toFixed(3)}, elapsed=${fmtMs(event.elapsedMs)}`,
    );
    return;
  }

  if (event.type === 'complete') {
    console.log(
      `[closed-loop] complete: score=${event.finalScore.toFixed(3)}, elapsed=${fmtMs(event.elapsedMs)}`,
    );
  }
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = `temp/balance-closed-loop/${timestamp}`;
  await mkdir(outputDir, { recursive: true });

  const result = await runClosedLoopBalance({
    populationSize: Number(process.env.BALANCE_POPULATION ?? 80),
    levelRange: [1, Number(process.env.BALANCE_MAX_LEVEL ?? 18)],
    daysPerIteration: Number(process.env.BALANCE_DAYS ?? 60),
    maxIterations: Number(process.env.BALANCE_ITERATIONS ?? 8),
    seed: Number(process.env.BALANCE_SEED ?? 42),
    simulation: {
      attackLevelRange: Number(process.env.BALANCE_ATTACK_LEVEL_RANGE ?? 5),
      turnIntervalMinutes: Number(process.env.BALANCE_TURN_INTERVAL ?? 30),
      logLevel: 'none',
    },
    onProgress: logProgress,
  });

  await Bun.write(
    `${outputDir}/closed-loop.json`,
    JSON.stringify(result.artifact, null, 2),
  );

  const compact = {
    finalScore: result.finalScore,
    finalBalance: result.finalBalance,
    finalMetrics: result.finalMetrics,
    iterations: result.iterations.map((iteration) => ({
      iteration: iteration.iteration,
      accepted: iteration.accepted,
      selected: iteration.selected.label,
      score: iteration.selected.score,
      balance: iteration.selected.balance,
      diagnoses: iteration.selected.diagnoses,
    })),
  };

  await Bun.write(
    `${outputDir}/closed-loop-summary.json`,
    JSON.stringify(compact, null, 2),
  );

  console.log(`Saved closed-loop balance output: ${outputDir}`);
  console.log(JSON.stringify(compact, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
