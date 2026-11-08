import { useMemo } from 'react';
import useSWR from 'swr';

import { fetchRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { buildGuideFacts, type GuideFacts } from '@/utils/guideFacts';

/**
 * The numbers the public guides print. The server render uses the code
 * defaults so crawlers read real values; once the page hydrates, the live
 * server settings replace them (read once, public pages do not poll).
 */
export function useGuideFacts(): GuideFacts {
  const { data } = useSWR('/api/config', fetchRuntimeConfig, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return useMemo(() => buildGuideFacts(data), [data]);
}
