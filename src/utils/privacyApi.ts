import type { NextApiResponse } from 'next';

import { ExportError } from '@/services/AccountDataExport.service';
import { ErasureError } from '@/services/AccountErasure.service';
import { ReauthError } from '@/utils/reauth';

/** Status for each refusal the privacy routes can return. */
const ERASURE_STATUS: Record<string, number> = {
  staff_account: 403,
  already_scheduled: 409,
  rate_limited: 429,
  email_failed: 502,
  invalid_token: 400,
  not_found: 404,
  not_pending: 409,
  reason_required: 422,
  not_due: 409,
  already_erased: 409,
};

/**
 * Writes the response for an expected privacy refusal and returns true, or
 * returns false so the caller can treat the error as unexpected. Codes are
 * stable strings the UI maps to translated text; no internal detail leaks.
 */
export function respondPrivacyError(
  res: NextApiResponse,
  error: unknown,
): boolean {
  if (error instanceof ReauthError) {
    res
      .status(error.code === 'rate_limited' ? 429 : 401)
      .json({ error: error.code });
    return true;
  }
  if (error instanceof ErasureError) {
    res.status(ERASURE_STATUS[error.code] ?? 400).json({ error: error.code });
    return true;
  }
  if (error instanceof ExportError) {
    res
      .status(error.code === 'rate_limited' ? 429 : 404)
      .json({ error: error.code, retryAt: error.retryAt?.toISOString() });
    return true;
  }
  return false;
}
