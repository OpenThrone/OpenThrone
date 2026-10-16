import { createBalancedPlayer, printResults, runSimulation } from '../src/sim';

async function main() {
  console.log('=== Test 1: Level 10 Balanced vs Balanced (Equal Power) ===');
  const attacker1 = createBalancedPlayer(10, 'balanced');
  const defender1 = createBalancedPlayer(10, 'balanced');
  const results1 = await runSimulation(attacker1, defender1, 200);
  printResults(results1);

  console.log('\n=== Test 2: Level 10 Strong Offense vs Strong Defense ===');
  const attacker2 = createBalancedPlayer(10, 'offense');
  const defender2 = createBalancedPlayer(10, 'defense');
  const results2 = await runSimulation(attacker2, defender2, 200);
  printResults(results2);

  console.log('\n=== Test 3: Level 15 vs Level 10 (Higher Level Attacker) ===');
  const attacker3 = createBalancedPlayer(15, 'offense');
  const defender3 = createBalancedPlayer(10, 'defense');
  const results3 = await runSimulation(attacker3, defender3, 200);
  printResults(results3);

  console.log('\n=== Test 4: Level 10 vs Level 15 (Lower Level Attacker) ===');
  const attacker4 = createBalancedPlayer(10, 'offense');
  const defender4 = createBalancedPlayer(15, 'defense');
  const results4 = await runSimulation(attacker4, defender4, 200);
  printResults(results4);

  console.log('\n=== Test 5: Level 5 vs Level 10 (5 Level Difference) ===');
  const attacker5 = createBalancedPlayer(5, 'offense');
  const defender5 = createBalancedPlayer(10, 'defense');
  const results5 = await runSimulation(attacker5, defender5, 200);
  printResults(results5);
}

main().catch(console.error);
