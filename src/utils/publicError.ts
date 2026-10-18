/**
 * The message an API route may show a player for a thrown error.
 *
 * Routes return `error.message` so business refusals ("Not enough gold")
 * reach the UI. Database and other internal errors must not: a Prisma
 * validation error, for example, lists every column of the queried model.
 */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function publicErrorMessage(
  error: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE,
): string {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error ? error : fallback;
  }
  const name = String((error as { name?: unknown }).name ?? '');
  const message = String((error as { message?: unknown }).message ?? '');
  if (!message) return fallback;
  if (
    name.startsWith('Prisma') ||
    /prisma|invocation|\bselect statement\b|Unknown (field|argument)|ECONNREFUSED|ETIMEDOUT|\bat .+:\d+:\d+/i.test(
      message,
    ) ||
    message.length > 300
  ) {
    return fallback;
  }
  return message;
}
