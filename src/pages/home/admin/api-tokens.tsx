import { Badge, Button, Group, Loader, Paper, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PermissionType } from '@prisma/client';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import PermissionCheck from '@/components/PermissionCheck';
import { logError } from '@/utils/logger';

const ApiTokensPage = () => {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/api-tokens');
      if (res.ok) setTokens(await res.json());
    } catch (err) {
      logError('Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const revoke = async (id: number) => {
    if (!confirm('Revoke this token? This cannot be undone.')) return;
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

  return (
    <PermissionCheck permissions={['MANAGE_API_TOKENS']}>
      <MainArea title="System: API Tokens">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Manage OAuth-style API tokens for service integrations.
          </Text>

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
                        <Table.Td>{t.client?.name || '—'}</Table.Td>
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
                              onClick={() => revoke(t.id)}
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
      </MainArea>
    </PermissionCheck>
  );
};

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
