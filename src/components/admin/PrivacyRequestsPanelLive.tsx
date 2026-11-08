import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import type {
  ErasureRow,
  ExportRow,
  PrivacyAction,
  PrivacyView,
} from '@/components/admin/PrivacyRequestsPanel';
import { PrivacyRequestsView } from '@/components/admin/PrivacyRequestsPanel';
import { getAdminRequestError } from '@/utils/adminRequests';
import { logError } from '@/utils/logger';

const PRIVACY_ERROR_KEYS: Record<string, string> = {
  not_pending: 'privacy.errors.not_pending',
  reason_required: 'privacy.errors.reason_required',
  staff_account: 'privacy.errors.staff_account',
  already_scheduled: 'privacy.errors.already_scheduled',
  not_found: 'privacy.errors.not_found',
};

/**
 * Live privacy-request panel. Without `userId` it lists every player's
 * requests; with one it is the single-player tab of the Edit Player screen.
 */
export default function PrivacyRequestsPanelLive({
  userId,
}: {
  userId?: number;
}) {
  const { t } = useTranslation('admin-users');
  const [view, setView] = useState<PrivacyView>('erasure');
  const [page, setPage] = useState(1);
  const [erasures, setErasures] = useState<ErasureRow[]>([]);
  const [exportRows, setExportRows] = useState<ExportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/privacy?view=${view}&page=${page}${userId ? `&userId=${userId}` : ''}`,
      );
      if (!response.ok) throw new Error(await getAdminRequestError(response));
      const data = await response.json();
      setTotal(data.total);
      if (view === 'erasure') setErasures(data.rows);
      else setExportRows(data.rows);
    } catch (err) {
      logError(err);
      setError(err instanceof Error ? err.message : t('privacy.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [view, page, userId, t]);
  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/privacy/erasure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const key = PRIVACY_ERROR_KEYS[data?.error];
        setError(key ? t(key) : await getAdminRequestError(response));
        return false;
      }
      setNotice(success);
      await load();
      return true;
    } catch (err) {
      logError(err);
      setError(t('privacy.errors.load'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrivacyRequestsView
      view={view}
      onViewChange={(next) => {
        setView(next);
        setPage(1);
      }}
      erasures={erasures}
      exports={exportRows}
      page={page}
      totalPages={Math.ceil(total / 50)}
      onPageChange={setPage}
      loading={loading}
      busy={busy}
      error={error}
      notice={notice}
      fixedUserId={userId}
      onAction={(action: PrivacyAction, requestId, reason) =>
        post({ action, requestId, reason }, t(`privacy.done.${action}`))
      }
      onOpen={(target, reason) =>
        post({ action: 'open', userId: target, reason }, t('privacy.done.open'))
      }
    />
  );
}
