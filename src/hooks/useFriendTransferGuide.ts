import { useTranslation } from 'next-i18next';
import useSWR from 'swr';

import {
  FRIEND_TRANSFER_ATTACK_BLOCK_HOURS,
  FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS,
  FRIEND_TRANSFER_MIN_LEVEL_DEFAULT,
} from '@/constants/FriendTransfer';
import { fetchRuntimeConfig } from '@/hooks/useRuntimeConfig';

/**
 * Plain-language friend gold transfer rules with the live minimum level,
 * shared by How to Play and the FAQ. Shows the default level until the config
 * loads; reads it once rather than polling, since these pages are public.
 */
export function useFriendTransferGuide(levelOverride?: number): string {
  const { t } = useTranslation('common');
  const { data } = useSWR(
    levelOverride === undefined ? '/api/config' : null,
    fetchRuntimeConfig,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return t('friendTransfer.guide', {
    level:
      levelOverride ??
      data?.friendTransferMinLevel ??
      FRIEND_TRANSFER_MIN_LEVEL_DEFAULT,
    days: FRIEND_TRANSFER_MIN_ACCOUNT_AGE_DAYS,
    hours: FRIEND_TRANSFER_ATTACK_BLOCK_HOURS,
  });
}
