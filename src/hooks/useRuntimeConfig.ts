import useSWR from 'swr';

import type { RuntimeConfig } from '@/services/RuntimeConfig.service';

async function fetchRuntimeConfig(url: string): Promise<RuntimeConfig> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Runtime configuration unavailable');
  return response.json() as Promise<RuntimeConfig>;
}

export function useRuntimeConfig() {
  const { data, error, isLoading, mutate } = useSWR<RuntimeConfig>(
    '/api/config',
    fetchRuntimeConfig,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      shouldRetryOnError: true,
      errorRetryInterval: 3000,
    },
  );
  return {
    config: data ?? null,
    loading: isLoading,
    error: error ? 'Runtime configuration unavailable' : null,
    mutate,
  };
}
