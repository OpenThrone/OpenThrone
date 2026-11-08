import {
  Alert,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import {
  type AdminForceContract,
  type AdminForceObligation,
  type AdminWound,
  type ForceAction,
  ForceActionModal,
  ForceContractsTable,
  ForceObligationsTable,
  ForceWoundedTable,
} from '@/components/admin/ForceAdminTables';
import { logError } from '@/utils/logger';

/** Requires the `admin-forces` namespace on the host page. */
export interface PlayerForcesPanelProps {
  userId: number;
}

/** One player's contracts, obligations and wounded units, with admin actions. */
export default function PlayerForcesPanel({ userId }: PlayerForcesPanelProps) {
  const { t } = useTranslation('admin-forces');
  const [contracts, setContracts] = useState<AdminForceContract[]>([]);
  const [obligations, setObligations] = useState<AdminForceObligation[]>([]);
  const [wounded, setWounded] = useState<AdminWound[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState<ForceAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [c, o, w] = await Promise.all([
        fetch(`/api/admin/forces/contracts?userId=${userId}&limit=100`),
        fetch(
          `/api/admin/forces/obligations?userId=${userId}&state=all&limit=100`,
        ),
        fetch(`/api/admin/forces/wounded?userId=${userId}`),
      ]);
      if (!c.ok || !o.ok || !w.ok) throw new Error('HTTP error');
      const [cd, od, wd] = await Promise.all([c.json(), o.json(), w.json()]);
      setContracts(cd.contracts ?? []);
      setObligations(od.obligations ?? []);
      setWounded(wd.wounded ?? []);
    } catch (err) {
      logError('Failed to load player forces:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );

  if (loadError)
    return (
      <Alert color="red" title={t('loadError')}>
        <Button variant="default" size="xs" onClick={load}>
          {t('retry')}
        </Button>
      </Alert>
    );

  const totalWounded = wounded.reduce((s, w) => s + Number(w.quantity ?? 0), 0);

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={4}>{t('contracts')}</Title>
        <ForceContractsTable
          contracts={contracts}
          onAction={setAction}
          showPlayer={false}
        />
      </Stack>
      <Stack gap="xs">
        <Title order={4}>{t('obligations')}</Title>
        <ForceObligationsTable
          obligations={obligations}
          onAction={setAction}
          showPlayer={false}
        />
      </Stack>
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={4}>{t('woundedUnits')}</Title>
          {totalWounded > 0 && (
            <Button
              size="xs"
              onClick={() => setAction({ kind: 'heal', id: userId })}
            >
              {t('healAll')}
            </Button>
          )}
        </Group>
        <ForceWoundedTable wounded={wounded} />
        {totalWounded > 0 && (
          <Text size="xs" c="dimmed">
            {t('healMessage')}
          </Text>
        )}
      </Stack>
      <ForceActionModal
        action={action}
        onClose={() => setAction(null)}
        onDone={load}
      />
    </Stack>
  );
}
