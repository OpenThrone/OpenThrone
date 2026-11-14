import { Alert, Button, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { AllianceCard } from '@/components/alliance/AllianceCard';
import {
  type AllianceDuesTerms,
  duesTermsOf,
  hasDues,
  joinTermsMessage,
} from '@/components/alliance/AllianceMembershipDues';
import ConfirmationModal from '@/components/ConfirmationModal';
import MainArea from '@/components/MainArea';
import { getAllianceLevel } from '@/constants/allianceLevels';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { Locales } from '@/types/typings';
import { allianceApiError } from '@/utils/allianceErrorMessage';
import { logError } from '@/utils/logger';

type BrowseStatus = 'loading' | 'ready' | 'error';

/** Message to show instead of (or before) the alliance grid, if any. */
export const browseNotice = (
  status: BrowseStatus,
  count: number,
): 'loading' | 'error' | 'empty' | null => {
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return count === 0 ? 'empty' : null;
};

const Browse = () => {
  const [alliances, setAlliances] = useState([]);
  const [status, setStatus] = useState<BrowseStatus>('loading');
  const { t, i18n } = useTranslation('alliances');
  const { user, forceUpdate } = useUser();
  const locale = i18n.language as Locales;
  // A fee or dues is confirmed before the player joins or asks to join.
  const [confirming, setConfirming] = useState<{
    id: number;
    name: string;
    request: boolean;
    terms: AllianceDuesTerms;
  } | null>(null);
  const [joining, setJoining] = useState(false);

  const fetchAlliances = async () => {
    try {
      const response = await fetch('/api/alliances/getAll');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      setAlliances(Array.isArray(data) ? data : []);
      setStatus('ready');
    } catch (error) {
      logError(t('browse.errorFetching'), error);
      setStatus('error');
    }
  };

  const join = async (allianceId: number, expectedFee?: bigint) => {
    try {
      const response = await fetch('/api/alliances/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allianceId,
          ...(expectedFee !== undefined
            ? { expectedFee: Number(expectedFee) }
            : {}),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        // A changed fee is shown again before the player retries.
        if (data.code === 'ALLIANCE_JOIN_FEE_CHANGED') fetchAlliances();
        throw data?.code
          ? allianceApiError(data, response.status)
          : new Error(data?.error || t('browse.joinError'));
      }

      alertService.success(data.message || t('browse.joinSuccess'));
      forceUpdate(); // Update user context to reflect membership
    } catch (error: any) {
      logError('Error joining alliance:', error);
      alertService.error(error.message);
    }
  };

  const handleJoin = async (allianceId: number) => {
    const alliance: any = alliances.find((a: any) => a.id === allianceId);
    const terms = duesTermsOf(alliance ?? {});
    if (terms.joinFee > 0n || hasDues(terms)) {
      setConfirming({
        id: allianceId,
        name: alliance?.name ?? '',
        request: alliance?.join_mode === 'REQUEST_TO_JOIN',
        terms,
      });
      return;
    }
    await join(allianceId, terms.joinFee);
  };

  const confirmJoin = async () => {
    if (!confirming || joining) return;
    setJoining(true);
    try {
      await join(confirming.id, confirming.terms.joinFee);
    } finally {
      setJoining(false);
      setConfirming(null);
    }
  };

  useEffect(() => {
    fetchAlliances();
  }, []);

  const notice = browseNotice(status, alliances.length);

  return (
    <MainArea title={t('browse.title')}>
      {notice === 'loading' && <Loader mx="auto" />}
      {notice === 'error' && (
        <Alert color="red" role="alert">
          {t('browse.errorFetching')}
        </Alert>
      )}
      {notice === 'empty' && (
        <Stack align="center" gap="sm">
          <Text fw={600}>{t('browse.noAlliances')}</Text>
          <Text c="var(--ot-muted)">{t('browse.noAlliancesHint')}</Text>
          <Button component={Link} href="/alliances/create">
            {t('mine.create')}
          </Button>
        </Stack>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {alliances.map((alliance) => {
          const userMembership = user?.alliance_memberships?.find(
            (m) => m.alliance_id === alliance.id,
          );
          const isLeader = user?.ledAlliances?.some(
            (a) => a.id === alliance.id,
          );

          return (
            <AllianceCard
              key={alliance.id}
              name={alliance.name}
              isPremium={alliance.isPremium}
              status={alliance.status}
              premiumUntil={alliance.premiumUntil}
              description={alliance.motto}
              members={alliance._count.members}
              gold={
                alliance.gold_in_bank != null
                  ? alliance.gold_in_bank.toString().replace('n', '')
                  : null
              }
              joinText={t('browse.join')}
              imgsrc={alliance.avatar || null}
              bannerimgsrc={alliance.bannerimg || null}
              joinMode={alliance.join_mode}
              id={alliance.id}
              onJoin={handleJoin}
              // Check if user is member/leader
              userMembership={userMembership}
              isLeader={isLeader}
              roleName={userMembership?.role?.name}
              joinTerms={duesTermsOf(alliance)}
              memberCap={getAllianceLevel(alliance.hall_level).maxMembers}
            />
          );
        })}
      </SimpleGrid>
      <ConfirmationModal
        isOpen={confirming !== null}
        onClose={() => !joining && setConfirming(null)}
        onConfirm={confirmJoin}
        title={
          confirming?.request
            ? t('browse.requestToJoin')
            : t('memberDues.confirmTitle', { name: confirming?.name ?? '' })
        }
        message={
          confirming
            ? [
                joinTermsMessage(t, confirming.name, confirming.terms, locale),
                confirming.request ? t('memberDues.confirmRequestNote') : '',
              ]
                .filter(Boolean)
                .join(' ')
            : ''
        }
        type="primary"
        confirmText={
          confirming?.request
            ? t('browse.requestToJoin')
            : t('memberDues.confirmJoin')
        }
        cancelText={t('manage.cancel', 'Cancel')}
        isLoading={joining}
      />
    </MainArea>
  );
};

export default Browse;
