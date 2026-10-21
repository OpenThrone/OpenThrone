import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { AnnouncementSeverity } from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import { getAdminRequestError } from '@/utils/adminRequests';
import { logError } from '@/utils/logger';

const severityColor = (s: string) => {
  switch (s) {
    case 'CRITICAL':
      return 'red';
    case 'WARNING':
      return 'yellow';
    case 'SUCCESS':
      return 'green';
    default:
      return 'blue';
  }
};

const safeLink = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

const AnnouncementsPage = () => {
  const { t } = useTranslation('admin-content');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<string>('INFO');
  const [isBanner, setIsBanner] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [dismissible, setDismissible] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/content/announcements');
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      setAnnouncements(await res.json());
      setLoadError(null);
    } catch (err) {
      logError('Failed to load announcements:', err);
      setLoadError(t('announcements.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setTitle('');
    setBody('');
    setSeverity('INFO');
    setIsBanner(true);
    setIsActive(true);
    setDismissible(true);
    setStartsAt('');
    setEndsAt('');
    setLinkUrl('');
    open();
  };

  const openEdit = (a: any) => {
    setEditId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setSeverity(a.severity);
    setIsBanner(a.isBanner);
    setIsActive(a.isActive);
    setDismissible(a.dismissible);
    setStartsAt(
      a.startsAt ? new Date(a.startsAt).toISOString().slice(0, 16) : '',
    );
    setEndsAt(a.endsAt ? new Date(a.endsAt).toISOString().slice(0, 16) : '');
    setLinkUrl(a.linkUrl ?? '');
    open();
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      alertService.notify('error', t('announcements.required'), {
        title: t('announcements.errorTitle'),
      });
      return;
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      alertService.notify('error', t('announcements.endAfterStart'), {
        title: t('announcements.errorTitle'),
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        editId
          ? `/api/admin/content/announcements/${editId}`
          : '/api/admin/content/announcements',
        {
          method: editId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body,
            severity,
            isBanner,
            isActive,
            dismissible,
            startsAt: startsAt ? new Date(startsAt).toISOString() : null,
            endsAt: endsAt ? new Date(endsAt).toISOString() : null,
            linkUrl: linkUrl.trim() || null,
          }),
        },
      );
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      alertService.notify(
        'success',
        editId ? t('announcements.updated') : t('announcements.saved'),
        {
          title: editId
            ? t('announcements.updatedTitle')
            : t('announcements.createdTitle'),
        },
      );
      close();
      await fetchAnnouncements();
    } catch (err) {
      logError('Failed to create:', err);
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('announcements.saveFailed'),
        { title: t('announcements.errorTitle') },
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: number, currentActive: boolean) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/content/announcements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      {
        await fetchAnnouncements();
        alertService.notify(
          'success',
          !currentActive
            ? t('announcements.activated')
            : t('announcements.deactivated'),
          { title: t('announcements.updatedTitle') },
        );
      }
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('announcements.updateFailed'),
        { title: t('announcements.errorTitle') },
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/content/announcements/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await getAdminRequestError(res));
      {
        await fetchAnnouncements();
        alertService.notify('success', t('announcements.removed'), {
          title: t('announcements.deletedTitle'),
        });
      }
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('announcements.deleteFailed'),
        { title: t('announcements.errorTitle') },
      );
    }
  };

  return (
    <AdminLayout
      title={t('announcements.pageTitle')}
      permissions={['MANAGE_ANNOUNCEMENTS']}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t('announcements.intro')}
          </Text>
          <Button onClick={openCreate}>{t('announcements.new')}</Button>
        </Group>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : loadError ? (
          <Alert color="red" role="alert">
            {loadError}
            <Button ml="md" variant="default" onClick={fetchAnnouncements}>
              {t('announcements.retry')}
            </Button>
          </Alert>
        ) : announcements.length === 0 ? (
          <Alert color="blue">{t('announcements.empty')}</Alert>
        ) : (
          <AdminDataTable size="wide" ariaLabel={t('announcements.tableLabel')}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('announcements.colTitle')}</Table.Th>
                <Table.Th>{t('announcements.colSeverity')}</Table.Th>
                <Table.Th>{t('announcements.colBanner')}</Table.Th>
                <Table.Th>{t('announcements.colLink')}</Table.Th>
                <Table.Th>{t('announcements.colStarts')}</Table.Th>
                <Table.Th>{t('announcements.colActive')}</Table.Th>
                <Table.Th>{t('announcements.colCreated')}</Table.Th>
                <Table.Th>{t('announcements.colActions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {announcements.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>{a.title}</Table.Td>
                  <Table.Td>
                    <Text c={severityColor(a.severity)} fw={700}>
                      {t(`announcements.severity.${a.severity}`, {
                        defaultValue: a.severity,
                      })}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {a.isBanner
                      ? t('announcements.yes')
                      : t('announcements.no')}
                  </Table.Td>
                  <Table.Td>
                    {safeLink(a.linkUrl) ? (
                      <a
                        href={safeLink(a.linkUrl) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.linkUrl}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td>
                    {a.startsAt
                      ? new Date(a.startsAt).toLocaleString()
                      : t('announcements.now')}
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={a.isActive}
                      disabled={submitting}
                      onChange={() => toggleActive(a.id, a.isActive)}
                      aria-label={
                        a.isActive
                          ? t('announcements.setInactive', { title: a.title })
                          : t('announcements.setActive', { title: a.title })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    {new Date(a.createdAt).toLocaleDateString()}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => openEdit(a)}
                        aria-label={t('announcements.editAria', {
                          title: a.title,
                        })}
                      >
                        {t('announcements.edit')}
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => setDeleteTarget(a.id)}
                        aria-label={t('announcements.deleteAria', {
                          title: a.title,
                        })}
                      >
                        {t('announcements.delete')}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AdminDataTable>
        )}
      </Stack>

      <Modal
        opened={opened}
        onClose={() => !submitting && close()}
        title={
          editId ? t('announcements.editTitle') : t('announcements.newTitle')
        }
        size="lg"
        centered
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        withCloseButton={!submitting}
      >
        <Stack gap="md">
          <TextInput
            label={t('announcements.fieldTitle')}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <Textarea
            label={t('announcements.fieldBody')}
            minRows={4}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
          />
          <TextInput
            label={t('announcements.fieldLink')}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.currentTarget.value)}
          />
          <TextInput
            label={t('announcements.fieldStarts')}
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.currentTarget.value)}
          />
          <TextInput
            label={t('announcements.fieldEnds')}
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.currentTarget.value)}
          />
          <Select
            label={t('announcements.colSeverity')}
            data={Object.values(AnnouncementSeverity).map((s) => ({
              value: s,
              label: t(`announcements.severity.${s}`),
            }))}
            value={severity}
            onChange={(v) => v && setSeverity(v)}
          />
          <Switch
            label={t('announcements.fieldBanner')}
            checked={isBanner}
            onChange={(e) => setIsBanner(e.currentTarget.checked)}
          />
          <Switch
            label={t('announcements.fieldActive')}
            checked={isActive}
            onChange={(e) => setIsActive(e.currentTarget.checked)}
          />
          <Switch
            label={t('announcements.fieldDismissible')}
            checked={dismissible}
            onChange={(e) => setDismissible(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={submitting}>
              {t('announcements.cancel')}
            </Button>
            <Button onClick={handleSave} loading={submitting}>
              {editId
                ? t('announcements.saveChanges')
                : t('announcements.publish')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title={t('announcements.deleteConfirmTitle')}
        message={t('announcements.deleteConfirmMessage')}
        confirmText={t('announcements.delete')}
        cancelText={t('announcements.cancel')}
        type="destructive"
      />
    </AdminLayout>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
        'admin-content',
      ])),
    },
  };
};

export default AnnouncementsPage;
