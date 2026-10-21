import {
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
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
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

type ApiClientType = 'USER' | 'SYSTEM' | 'SERVICE';

interface ApiTokenRow {
  id: number;
  tokenPrefix: string;
  scopes: string[];
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  client?: {
    name: string;
    clientType: ApiClientType;
  } | null;
}

interface IssuedApiToken {
  token: string;
  tokenId: number;
  clientId: number;
  tokenPrefix: string;
}

const ApiTokensPage = () => {
  const { t } = useTranslation('admin-content');
  const [tokens, setTokens] = useState<ApiTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [revokeOpened, revokeModal] = useDisclosure(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<number | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [clientType, setClientType] = useState<ApiClientType>('SYSTEM');
  const [scopesText, setScopesText] = useState('admin:read');
  const [expiresAt, setExpiresAt] = useState('');
  const [issuedToken, setIssuedToken] = useState<IssuedApiToken | null>(null);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/api-tokens');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: { tokens?: ApiTokenRow[] } = await res.json();
      setTokens(data.tokens ?? []);
      setLoadError(null);
    } catch (err) {
      logError('Failed to load tokens:', err);
      setLoadError(t('apiTokens.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const openRevoke = (id: number) => {
    setPendingRevokeId(id);
    revokeModal.open();
  };

  const revoke = async () => {
    if (!pendingRevokeId) return;
    const id = pendingRevokeId;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/admin/api-tokens/${id}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      {
        alertService.notify('success', t('apiTokens.revokedMessage'), {
          title: t('apiTokens.revokedTitle'),
        });
        revokeModal.close();
        setPendingRevokeId(null);
        fetchTokens();
      }
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('apiTokens.revokeFailed'),
        { title: t('apiTokens.errorTitle') },
      );
    } finally {
      setRevokingId(null);
    }
  };

  const resetCreateForm = () => {
    setTokenName('');
    setClientType('SYSTEM');
    setScopesText('admin:read');
    setExpiresAt('');
  };

  const createToken = async () => {
    const scopes = scopesText
      .split(/[\n,]/)
      .map((scope) => scope.trim())
      .filter(Boolean);

    if (tokenName.trim().length < 3 || scopes.length === 0) {
      alertService.notify('error', t('apiTokens.missingDetails'), {
        title: t('apiTokens.missingDetailsTitle'),
      });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tokenName.trim(),
          clientType,
          scopes,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to issue token');

      const issued: IssuedApiToken = await res.json();
      setIssuedToken(issued);
      resetCreateForm();
      close();
      fetchTokens();
      alertService.notify('success', t('apiTokens.issuedMessage'), {
        title: t('apiTokens.issuedTitle'),
      });
    } catch (err) {
      logError('Failed to create token:', err);
      alertService.notify('error', t('apiTokens.issueFailed'), {
        title: t('apiTokens.errorTitle'),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminLayout
      title={t('apiTokens.pageTitle')}
      permissions={[PermissionType.MANAGE_API_TOKENS]}
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Text size="sm" c="dimmed">
            {t('apiTokens.intro')}
          </Text>
          <Button onClick={open}>{t('apiTokens.issueNew')}</Button>
        </Group>

        {issuedToken && (
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700}>{t('apiTokens.secretTitle')}</Text>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => setIssuedToken(null)}
                >
                  {t('apiTokens.dismiss')}
                </Button>
              </Group>
              <Text size="sm" c="dimmed">
                {t('apiTokens.secretNote', {
                  tokenId: issuedToken.tokenId,
                  clientId: issuedToken.clientId,
                })}
              </Text>
              <Code block>{issuedToken.token}</Code>
            </Stack>
          </Paper>
        )}

        <GameCard
          title={t('apiTokens.activeTitle', {
            count: tokens.filter((token) => !token.revokedAt).length,
          })}
        >
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : loadError ? (
            <Stack align="center" gap="sm">
              <Text c="red" role="alert">
                {loadError}
              </Text>
              <Button variant="default" onClick={fetchTokens}>
                {t('request.retry')}
              </Button>
            </Stack>
          ) : tokens.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              {t('apiTokens.empty')}
            </Text>
          ) : (
            <AdminDataTable ariaLabel={t('apiTokens.tableLabel')}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('apiTokens.colId')}</Table.Th>
                  <Table.Th>{t('apiTokens.colPrefix')}</Table.Th>
                  <Table.Th>{t('apiTokens.colClient')}</Table.Th>
                  <Table.Th>{t('apiTokens.colScopes')}</Table.Th>
                  <Table.Th>{t('apiTokens.colStatus')}</Table.Th>
                  <Table.Th>{t('apiTokens.colLastUsed')}</Table.Th>
                  <Table.Th>{t('apiTokens.colActions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tokens.map((token) => (
                  <Table.Tr key={token.id}>
                    <Table.Td>{token.id}</Table.Td>
                    <Table.Td>
                      <code>{token.tokenPrefix}</code>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm">{token.client?.name || '—'}</Text>
                        {token.client?.clientType && (
                          <Text size="xs" c="dimmed">
                            {token.client.clientType}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {Array.isArray(token.scopes)
                        ? token.scopes.join(', ')
                        : '—'}
                    </Table.Td>
                    <Table.Td>
                      {token.revokedAt ? (
                        <Badge color="red">
                          {t('apiTokens.statusRevoked')}
                        </Badge>
                      ) : token.expiresAt &&
                        new Date(token.expiresAt).getTime() <= Date.now() ? (
                        <Badge color="gray">
                          {t('apiTokens.statusExpired')}
                        </Badge>
                      ) : (
                        <Badge color="green">
                          {t('apiTokens.statusActive')}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {token.lastUsedAt
                        ? new Date(token.lastUsedAt).toLocaleString()
                        : t('apiTokens.never')}
                    </Table.Td>
                    <Table.Td>
                      {!token.revokedAt &&
                        (!token.expiresAt ||
                          new Date(token.expiresAt).getTime() > Date.now()) && (
                          <Button
                            size="xs"
                            color="red"
                            onClick={() => openRevoke(token.id)}
                            loading={revokingId === token.id}
                          >
                            {t('apiTokens.revoke')}
                          </Button>
                        )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </AdminDataTable>
          )}
        </GameCard>
      </Stack>

      <Modal
        opened={opened}
        onClose={() => {
          if (!creating) close();
        }}
        title={t('apiTokens.issueTitle')}
        centered
        closeOnClickOutside={!creating}
        closeOnEscape={!creating}
        withCloseButton={!creating}
      >
        <Stack>
          <TextInput
            label={t('apiTokens.clientName')}
            description={t('apiTokens.clientNameHint')}
            value={tokenName}
            onChange={(event) => setTokenName(event.currentTarget.value)}
          />
          <Select
            label={t('apiTokens.clientType')}
            data={[
              { value: 'SYSTEM', label: t('apiTokens.clientTypes.SYSTEM') },
              { value: 'SERVICE', label: t('apiTokens.clientTypes.SERVICE') },
              { value: 'USER', label: t('apiTokens.clientTypes.USER') },
            ]}
            value={clientType}
            onChange={(value) => value && setClientType(value as ApiClientType)}
          />
          <Textarea
            label={t('apiTokens.colScopes')}
            description={t('apiTokens.scopesHint')}
            minRows={3}
            value={scopesText}
            onChange={(event) => setScopesText(event.currentTarget.value)}
          />
          <TextInput
            label={t('apiTokens.expiresAt')}
            description={t('apiTokens.expiresAtHint')}
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={creating}>
              {t('apiTokens.cancel')}
            </Button>
            <Button onClick={createToken} loading={creating}>
              {t('apiTokens.issueConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ConfirmationModal
        isOpen={revokeOpened}
        onClose={() => {
          if (!revokingId) revokeModal.close();
        }}
        onConfirm={revoke}
        title={t('apiTokens.revokeTitle')}
        message={t('apiTokens.revokeMessage', { id: pendingRevokeId })}
        type="destructive"
        confirmText={t('apiTokens.revokeConfirm')}
        cancelText={t('apiTokens.cancel')}
        isLoading={!!revokingId}
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

export default ApiTokensPage;
