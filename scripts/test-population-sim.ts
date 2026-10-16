import {
  generatePopulation,
  printSimulationSummary,
  runPopulationSimulation,
} from '../src/sim';

async function main() {
  const population = generatePopulation(50, [5, 15], 42);
  const state = await runPopulationSimulation(population, 7, {
    logLevel: 'info',
  });

  printSimulationSummary(state);
}

main().catch(console.error);
