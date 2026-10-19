import useSWR from 'swr';

import type { RecruitmentStatus } from '@/utils/recruitmentStatus';

async function fetchStatus(url: string): Promise<RecruitmentStatus> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Recruitment status unavailable');
  return response.json() as Promise<RecruitmentStatus>;
}

/** Daily recruitment allowance for the signed-in player and the given targets. */
export function useRecruitmentStatus(
  targetIds: number[],
  enabled: boolean = true,
) {
  const key =
    enabled && targetIds.length
      ? `/api/recruit/status?ids=${[...targetIds].sort((a, b) => a - b).join(',')}`
      : null;
  const { data, mutate } = useSWR<RecruitmentStatus>(key, fetchStatus, {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
  return { status: data ?? null, refresh: mutate };
}
