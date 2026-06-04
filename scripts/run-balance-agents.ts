import { mkdir } from 'node:fs/promises';

import {
  artifactDailyResultsToCsv,
  artifactFinalPopulationToCsv,
  artifactTopPlayerTimelinesToCsv,
  BALANCE_PERSONAS,
  comparisonToCsv,
  printAutonomousRun,
  runAllBalancePersonas,
} from '../src/sim';

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = `temp/balance-reports/${timestamp}`;
  await mkdir(outputDir, { recursive: true });

  const { results, comparison } = await runAllBalancePersonas(BALANCE_PERSONAS);

  for (const result of results) {
    printAutonomousRun(result);
    if (result.artifact) {
      await Bun.write(
        `${outputDir}/${result.persona}.json`,
        JSON.stringify(result.artifact, null, 2),
      );
      await Bun.write(
        `${outputDir}/${result.persona}.daily.csv`,
        artifactDailyResultsToCsv(result.artifact),
      );
      await Bun.write(
        `${outputDir}/${result.persona}.population.csv`,
        artifactFinalPopulationToCsv(result.artifact),
      );
      await Bun.write(
        `${outputDir}/${result.persona}.timelines.csv`,
        artifactTopPlayerTimelinesToCsv(result.artifact),
      );
    }
  }

  const bundle = {
    generatedAt: new Date().toISOString(),
    personas: BALANCE_PERSONAS.map((persona) => ({
      name: persona.name,
      description: persona.description,
    })),
    comparison,
    reportsByPersona: Object.fromEntries(
      results.map((result) => [result.persona ?? 'unknown', result.reports]),
    ),
  };

  await Bun.write(
    `${outputDir}/comparison.json`,
    JSON.stringify(bundle, null, 2),
  );
  await Bun.write(`${outputDir}/comparison.csv`, comparisonToCsv(comparison));

  console.log(`Saved balance lab output: ${outputDir}`);
  console.log(JSON.stringify(comparison, null, 2));
}

main().catch(console.error);
