import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { getAdminRequestError } from '@/utils/adminRequests';
import { logError } from '@/utils/logger';

type Campaign = {
  id: number;
  kind: string;
  subject: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  createdBy?: { display_name: string };
};
type Counts = { inGame: number; email: number; outboxEnabled: boolean };
const MassMessagingPage = () => {
  const { user } = useUser();
  const isAdministrator = (user?.staffRoles ?? []).includes('ADMINISTRATOR');
  const { t, i18n } = useTranslation('admin-content');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('IN_GAME');
  const [audience, setAudience] = useState('specific');
  const [recipientIds, setRecipientIds] = useState('');
  const [days, setDays] = useState<number | string>(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<{
    subject: string;
    text: string;
    html: string;
  } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [outboxEnabled, setOutboxEnabled] = useState(true);
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/content/email-campaigns');
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      const data = await res.json();
      setCampaigns(data.campaigns);
      setOutboxEnabled(data.outboxEnabled);
    } catch (err) {
      logError('Campaign history failed', err);
      setError(t('emailAdmin.loadError'));
    }
  }, [t]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);
  const adminRequired = audience !== 'specific' && channel !== 'IN_GAME';
  const sendDisabled = adminRequired && !isAdministrator;
  const request = async (action: string) => {
    const ids = recipientIds
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map(Number);
    if (
      audience === 'specific' &&
      !['preview', 'test'].includes(action) &&
      (!ids.length ||
        ids.length > 1000 ||
        ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
    )
      throw new Error(t('emailAdmin.invalidIds'));
    const res = await fetch('/api/admin/content/mass-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body,
        channel,
        action,
        idempotencyKey: action === 'send' ? crypto.randomUUID() : undefined,
        sendToAll: audience === 'all',
        recipientUserIds:
          audience === 'specific' ? [...new Set(ids)] : undefined,
        activeWithinDays: audience === 'active' ? Number(days) : undefined,
      }),
    });
    if (!res.ok) throw new Error(await getAdminRequestError(res));
    return res.json();
  };
  const act = async (action: string) => {
    setBusy(true);
    setError('');
    try {
      const data = await request(action);
      if (action === 'count') {
        setCounts(data);
        setOutboxEnabled(data.outboxEnabled);
        setConfirm(true);
      }
      if (action === 'preview') setPreview(data);
      if (action === 'test')
        alertService.notify('info', t('emailAdmin.testSent'));
      if (action === 'send') {
        setConfirm(false);
        alertService.notify(
          'info',
          t('emailAdmin.sent', {
            sent: data.sent,
            queued: data.queued,
          }),
        );
        await loadHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('emailAdmin.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminLayout
      title={t('emailAdmin.broadcast')}
      permissions={['SEND_MASS_MESSAGES']}
    >
      <Stack>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {!outboxEnabled && (
          <Alert color="yellow">{t('emailAdmin.outboxDisabled')}</Alert>
        )}
        <GameCard title={t('emailAdmin.compose')}>
          <Stack>
            <Select
              label={t('emailAdmin.channel')}
              value={channel}
              allowDeselect={false}
              onChange={(v) => setChannel(v ?? 'IN_GAME')}
              data={['IN_GAME', 'EMAIL', 'BOTH'].map((value) => ({
                value,
                label: t(`emailAdmin.channels.${value}`),
              }))}
            />
            <Select
              label={t('emailAdmin.audience')}
              value={audience}
              allowDeselect={false}
              onChange={(v) => setAudience(v ?? 'specific')}
              data={['specific', 'all', 'active'].map((value) => ({
                value,
                label: t(`emailAdmin.audiences.${value}`),
              }))}
            />
            {adminRequired && (
              <Text size="sm">{t('emailAdmin.adminRequired')}</Text>
            )}
            {audience === 'specific' && (
              <TextInput
                label={t('emailAdmin.recipientIds')}
                value={recipientIds}
                onChange={(e) => setRecipientIds(e.currentTarget.value)}
              />
            )}
            {audience === 'active' && (
              <NumberInput
                label={t('emailAdmin.activeDays')}
                min={1}
                max={36500}
                value={days}
                onChange={setDays}
              />
            )}
            <TextInput
              label={t('emailAdmin.subject')}
              value={subject}
              onChange={(e) => setSubject(e.currentTarget.value)}
              maxLength={200}
            />
            <Textarea
              label={t('emailAdmin.body')}
              minRows={6}
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              maxLength={5000}
            />
            <Group justify="flex-end">
              {channel !== 'IN_GAME' && (
                <>
                  <Button
                    variant="default"
                    disabled={busy || !subject.trim() || !body.trim()}
                    onClick={() => act('preview')}
                  >
                    {t('emailAdmin.preview')}
                  </Button>
                  <Button
                    variant="default"
                    disabled={busy || !subject.trim() || !body.trim()}
                    onClick={() => act('test')}
                  >
                    {t('emailAdmin.test')}
                  </Button>
                </>
              )}
              <Button
                loading={busy}
                disabled={sendDisabled || !subject.trim() || !body.trim()}
                onClick={() => act('count')}
              >
                {t('emailAdmin.review')}
              </Button>
            </Group>
          </Stack>
        </GameCard>
        <GameCard title={t('emailAdmin.history')}>
          <AdminDataTable ariaLabel={t('emailAdmin.history')}>
            <Table.Thead>
              <Table.Tr>
                {['kind', 'subject', 'status', 'counts', 'creator', 'date'].map(
                  (key) => (
                    <Table.Th key={key}>{t(`emailAdmin.${key}`)}</Table.Th>
                  ),
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {campaigns.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{t(`emailAdmin.kinds.${c.kind}`)}</Table.Td>
                  <Table.Td>{c.subject}</Table.Td>
                  <Table.Td>{t(`emailAdmin.statuses.${c.status}`)}</Table.Td>
                  <Table.Td>
                    {t('emailAdmin.campaignCounts', {
                      total: c.recipientCount,
                      sent: c.sentCount,
                      failed: c.failedCount,
                      skipped: c.skippedCount,
                    })}
                  </Table.Td>
                  <Table.Td>{c.createdBy?.display_name ?? '—'}</Table.Td>
                  <Table.Td>
                    {new Date(c.createdAt).toLocaleString(i18n.language)}
                  </Table.Td>
                </Table.Tr>
              ))}
              {!campaigns.length && (
                <Table.Tr>
                  <Table.Td colSpan={6}>{t('emailAdmin.empty')}</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </AdminDataTable>
        </GameCard>
        <ConfirmationModal
          isOpen={confirm}
          onClose={() => !busy && setConfirm(false)}
          onConfirm={() => act('send')}
          title={t('emailAdmin.confirm')}
          message={t('emailAdmin.confirmCounts', {
            inGame: counts?.inGame ?? 0,
            email: counts?.email ?? 0,
          })}
          type="primary"
          confirmText={t('emailAdmin.send')}
          cancelText={t('emailAdmin.cancel')}
          isLoading={busy}
          confirmDisabled={sendDisabled}
        >
          {!outboxEnabled && (
            <Alert color="yellow">{t('emailAdmin.outboxDisabled')}</Alert>
          )}
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
        </ConfirmationModal>
        <Modal
          opened={!!preview}
          onClose={() => setPreview(null)}
          title={t('emailAdmin.preview')}
          size="xl"
        >
          <Stack>
            <Text fw={700}>{preview?.subject}</Text>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{preview?.text}</Text>
            <iframe
              title={t('emailAdmin.preview')}
              sandbox=""
              srcDoc={preview?.html}
              style={{ width: '100%', height: 350, border: 0 }}
            />
            <Code block>{preview?.html}</Code>
          </Stack>
        </Modal>
      </Stack>
    </AdminLayout>
  );
};
export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-content',
    ])),
  },
});
export default MassMessagingPage;
