import useSWR from 'swr';

import type { SupporterStatus } from '@/types/supporter';
import { SupporterRequestError } from '@/utils/checkoutReturn';

export function useSupporterStatus(enabled = true) {
  return useSWR<SupporterStatus, SupporterRequestError>(
    enabled ? '/api/supporter/status' : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new SupporterRequestError(response.status);
      return response.json();
    },
  );
}
