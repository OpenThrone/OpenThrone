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
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

type ApiClientType = 'USER' | 'SYSTEM' | 'SERVICE';

interface ApiTokenRow {
  id: number;
  tokenPrefix: string;
  scopes: string[];
  revokedAt: string | null;
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
  const [tokens, setTokens] = useState<ApiTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
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
      if (res.ok) {
        const data: { tokens?: ApiTokenRow[] } = await res.json();
        setTokens(data.tokens ?? []);
      }
    } catch (err) {
      logError('Failed to load tokens:', err);
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
      if (res.ok) {
        notifications.show({
          title: 'Revoked',
          message: 'Token revoked.',
          color: 'green',
        });
        revokeModal.close();
        setPendingRevokeId(null);
        fetchTokens();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed.',
        color: 'red',
      });
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
      notifications.show({
        title: 'Missing details',
        message: 'Token name and at least one scope are required.',
        color: 'red',
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
      notifications.show({
        title: 'Token issued',
        message: 'Copy the token now; it will not be shown again.',
        color: 'green',
      });
    } catch (err) {
      logError('Failed to create token:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to issue token.',
        color: 'red',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminLayout
      title="System: API Tokens"
      permissions={[PermissionType.MANAGE_API_TOKENS]}
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Text size="sm" c="dimmed">
            Manage OAuth-style API tokens for service integrations. Newly issued
            secrets are shown once, then only their prefix remains visible.
          </Text>
          <Button onClick={open}>+ Issue Token</Button>
        </Group>

        {issuedToken && (
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700}>One-time token secret</Text>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => setIssuedToken(null)}
                >
                  Dismiss
                </Button>
              </Group>
              <Text size="sm" c="dimmed">
                Token #{issuedToken.tokenId} for client #{issuedToken.clientId};
                copy this value before leaving the page.
              </Text>
              <Code block>{issuedToken.token}</Code>
            </Stack>
          </Paper>
        )}

        <GameCard title={`Active Tokens (${tokens.length})`}>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : tokens.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              No API tokens.
            </Text>
          ) : (
            <Paper withBorder>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Prefix</Table.Th>
                    <Table.Th>Client</Table.Th>
                    <Table.Th>Scopes</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Last Used</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {tokens.map((t) => (
                    <Table.Tr key={t.id}>
                      <Table.Td>{t.id}</Table.Td>
                      <Table.Td>
                        <code>{t.tokenPrefix}</code>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm">{t.client?.name || '—'}</Text>
                          {t.client?.clientType && (
                            <Text size="xs" c="dimmed">
                              {t.client.clientType}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        {Array.isArray(t.scopes) ? t.scopes.join(', ') : '—'}
                      </Table.Td>
                      <Table.Td>
                        {t.revokedAt ? (
                          <Badge color="red">Revoked</Badge>
                        ) : (
                          <Badge color="green">Active</Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {t.lastUsedAt
                          ? new Date(t.lastUsedAt).toLocaleString()
                          : 'Never'}
                      </Table.Td>
                      <Table.Td>
                        {!t.revokedAt && (
                          <Button
                            size="xs"
                            color="red"
                            variant="outline"
                            onClick={() => openRevoke(t.id)}
                            loading={revokingId === t.id}
                          >
                            Revoke
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </GameCard>
      </Stack>

      <Modal opened={opened} onClose={close} title="Issue API Token">
        <Stack>
          <TextInput
            label="Client name"
            description="Human-readable owner, integration, or service name."
            value={tokenName}
            onChange={(event) => setTokenName(event.currentTarget.value)}
          />
          <Select
            label="Client type"
            data={[
              { value: 'SYSTEM', label: 'System' },
              { value: 'SERVICE', label: 'Service' },
              { value: 'USER', label: 'User' },
            ]}
            value={clientType}
            onChange={(value) => value && setClientType(value as ApiClientType)}
          />
          <Textarea
            label="Scopes"
            description="Separate scopes with commas or new lines."
            minRows={3}
            value={scopesText}
            onChange={(event) => setScopesText(event.currentTarget.value)}
          />
          <TextInput
            label="Expires at"
            description="Optional expiration date/time."
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={createToken} loading={creating}>
              Issue Token
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={revokeOpened}
        onClose={revokeModal.close}
        title="Revoke API Token"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            This immediately disables token #{pendingRevokeId}. Existing
            integrations using it will stop authenticating.
          </Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={revokeModal.close}>
              Cancel
            </Button>
            <Button color="red" onClick={revoke} loading={!!revokingId}>
              Revoke Token
            </Button>
          </Group>
        </Stack>
      </Modal>
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
      ])),
    },
  };
};

export default ApiTokensPage;
