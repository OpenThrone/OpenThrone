/**
 * Registers the bot's slash commands with Discord. Run once per bot, and again
 * whenever DISCORD_COMMANDS changes.
 *
 *   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... [DISCORD_GUILD_ID=...] \
 *     bun --no-env-file scripts/discord-register-commands.ts
 *
 * With DISCORD_GUILD_ID the commands go to that server only and appear at
 * once (use it for testing); without it they are global.
 */
import { DISCORD_COMMANDS } from '@/services/discord/DiscordCommands.service';

const app = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!app || !token)
  throw new Error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN');
const guild = process.env.DISCORD_GUILD_ID;
const path = guild
  ? `/applications/${app}/guilds/${guild}/commands`
  : `/applications/${app}/commands`;

const response = await fetch(`https://discord.com/api/v10${path}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(DISCORD_COMMANDS),
});
if (!response.ok) {
  console.error(`Discord refused the commands: HTTP ${response.status}`);
  process.exit(1);
}
const registered = (await response.json()) as { name: string }[];
console.log(
  `Registered ${registered.length} commands ${guild ? 'in the test server' : 'globally'}: ${registered.map((c) => c.name).join(', ')}`,
);
