import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import {
  type ReactivationProgressView,
  ReservedAllianceNotice,
} from '@/components/alliance/ReservedAllianceNotice';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { toLocale } from '@/utils/numberFormatting';

interface ReservedAllianceSectionProps {
  allianceId: number;
  allianceName: string;
  leaderName?: string | null;
  isMember: boolean;
  isLeader: boolean;
  onChanged?: () => void;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load (${res.status})`);
  return res.json();
};

/**
 * Live wiring of ReservedAllianceNotice on the alliance page: loads the
 * reactivation standing, runs the leader's one-click pay (server-side it is a
 * single idempotent transaction) and the member's leave.
 */
export const ReservedAllianceSection = ({
  allianceId,
  allianceName,
  leaderName,
  isMember,
  isLeader,
  onChanged,
}: ReservedAllianceSectionProps) => {
  const { t } = useTranslation('alliances');
  const { user } = useUser();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: progress, mutate } = useSWR<ReactivationProgressView>(
    `/api/alliances/reactivate?allianceId=${allianceId}`,
    fetcher,
    { refreshInterval: 30000 },
  );

  const cost = progress
    ? toLocale(progress.requirements.costGold, user?.locale)
    : '';

  const reactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await allianceRequest('/api/alliances/reactivate', {
        allianceId,
      });
      alertService.success(
        result?.reactivated === false
          ? t('reserved.alreadyActive')
          : t('reserved.success'),
      );
      setConfirming(false);
      await mutate();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reserved.error'));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      await allianceRequest('/api/alliances/leave', { allianceId });
      alertService.success(
        t('index.leaveSuccess', 'You have left the alliance'),
      );
      router.push('/alliances');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reserved.error'));
    } finally {
      setBusy(false);
    }
  };

  const viewer = isLeader ? 'leader' : isMember ? 'member' : 'visitor';
  return (
    <>
      <ReservedAllianceNotice
        allianceName={allianceName}
        leaderName={leaderName}
        viewer={viewer}
        progress={progress ?? null}
        onReactivate={() => setConfirming(true)}
        onLeave={leave}
        busy={busy}
        error={error}
        locale={user?.locale}
      />
      <ConfirmationModal
        isOpen={confirming}
        title={t('reserved.confirmTitle', { name: allianceName })}
        message={t('reserved.confirmBody', { cost })}
        type="primary"
        confirmText={t('reserved.confirm')}
        cancelText={t('manage.cancel', 'Cancel')}
        isLoading={busy}
        onConfirm={reactivate}
        onClose={() => setConfirming(false)}
      />
    </>
  );
};
