import { processDiscordOutboxOne } from '@/services/discord/DiscordAlerts.service';
import { discordBotConfigured } from '@/services/discord/DiscordApi';
import { logError } from '@/utils/logger';

/**
 * Sends queued Discord DMs one at a time. Each DM is two Discord requests,
 * so 4 per second stays far below the bot's global limit; 429s reschedule
 * the row by Discord's retry_after.
 */
export function startDiscordOutboxWorker() {
  if (!discordBotConfigured()) return () => {};
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    let delay = 5000;
    try {
      if ((await processDiscordOutboxOne()) !== null) delay = 250;
    } catch {
      // Errors may echo request details; keep the log generic.
      logError('Discord outbox poll failed');
      delay = 15_000;
    }
    if (!stopped) timer = setTimeout(poll, delay);
  };
  poll().catch(() => logError('Discord outbox worker stopped unexpectedly'));
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
