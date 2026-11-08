import { FRIEND_TRANSFER_MIN_LEVEL_CODE } from '@/constants/FriendTransfer';
import { publicErrorMessage } from '@/utils/publicError';

/**
 * Response body for a refused friend transfer or gold request. Level refusals
 * carry a code with the role and level so the client shows a translated
 * message; every other refusal is its plain message.
 */
export function friendTransferErrorBody(error: unknown) {
  const details = (error as { details?: Record<string, unknown> } | null)
    ?.details;
  return {
    error: publicErrorMessage(error),
    ...(details?.code === FRIEND_TRANSFER_MIN_LEVEL_CODE
      ? {
          code: FRIEND_TRANSFER_MIN_LEVEL_CODE,
          role: details.role,
          minLevel: details.minLevel,
        }
      : {}),
  };
}
