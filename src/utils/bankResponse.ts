export interface BankActionResult {
  ok: boolean;
  /** Server message, or null when the server could not be reached. */
  error?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Read a bank deposit/withdraw response without trusting its body.
 *
 * A gateway or restart page arrives as HTML. `error: null` tells the caller
 * the server could not be reached (the request may or may not have landed)
 * instead of showing
 * the JSON parser's message.
 */
export async function readBankResponse(
  response: Response,
): Promise<BankActionResult> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: null };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: null };
  const body = data as Record<string, unknown>;
  if (typeof body.error === 'string' && body.error)
    return { ok: false, error: body.error };
  if (!response.ok) return { ok: false, error: null };
  return { ok: true, data: body };
}
