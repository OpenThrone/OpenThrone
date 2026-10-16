import { BotService } from '../src/services/Bot.service';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('--dry');
  const manifestFlagIdx = args.indexOf('--manifest');
  const manifestName =
    manifestFlagIdx >= 0 ? args[manifestFlagIdx + 1] : undefined;

  if (dryRun) {
    console.log('=== DRY RUN — no DB writes ===');
  }
  if (manifestName) {
    console.log(`Using manifest: ${manifestName}`);
  } else {
    console.log('Using default manifest');
  }

  const result = await BotService.provisionBotsFromManifest(manifestName, {
    dryRun,
  });

  console.log('\n=== Provisioning Summary ===');
  console.log(`Manifest: ${result.manifestName}`);
  console.log(`Planned: ${result.planned.length}`);

  if (dryRun) {
    console.log('\nPlanned bots:');
    for (const spec of result.planned) {
      console.log(
        `  ${spec.displayName} <${spec.email}>  race=${spec.race} class=${spec.class} persona=${spec.persona}`,
      );
    }
    return;
  }

  console.log(`Created: ${result.created.length}`);
  for (const c of result.created) {
    console.log(
      `  [${c.id}] ${c.displayName} <${c.email}>  persona=${c.persona}`,
    );
  }
  console.log(`Skipped: ${result.skipped.length}`);
  for (const s of result.skipped) {
    console.log(`  ${s.email} — ${s.reason}`);
  }
  console.log(`Failed: ${result.failed.length}`);
  for (const f of result.failed) {
    console.log(`  ${f.email} — ${f.reason}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed-bots failed:', error);
    process.exit(1);
  });
