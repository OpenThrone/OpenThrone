import { mkdir } from 'node:fs/promises';

import {
  formatPlaytestSummary,
  parsePlaytestArgs,
  runDecisionPlaytest,
} from '../src/sim/decisionPlaytest';

async function main() {
  const { config, outDir, providerNote } = parsePlaytestArgs(
    process.argv.slice(2),
  );
  console.log(providerNote);
  const report = await runDecisionPlaytest(config);
  console.log(formatPlaytestSummary(report));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = outDir ?? `temp/decision-playtest/${timestamp}`;
  await mkdir(dir, { recursive: true });
  await Bun.write(`${dir}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Saved report: ${dir}/report.json`);
  if (report.findings.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
