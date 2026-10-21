import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import type { TFunction } from 'i18next';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useUser } from '@/context/users';
import type { Locales } from '@/types/typings';
import { formatGold } from '@/utils/numberFormatting';

interface GoldRequest {
  id: number;
  from_user: { id: number; display_name: string };
  to_user: { id: number; display_name: string };
  gold_amount: bigint;
  stats: {
    transferType: string;
    senderNote?: string;
    expiresAt?: string;
  };
  date_time: string;
}

interface GoldRequestNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestComplete: () => void;
}

interface ExpiryState {
  expired: boolean;
  label: string;
}

const formatExpiry = (expiresAt: string, t: TFunction): ExpiryState => {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) {
    return { expired: true, label: t('goldRequestInbox.expired') };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return {
      expired: false,
      label: t('goldRequestInbox.daysHoursLeft', { days, hours }),
    };
  }
  if (hours > 0) {
    return {
      expired: false,
      label: t('goldRequestInbox.hoursMinutesLeft', { hours, minutes }),
    };
  }
  return {
    expired: false,
    label: t('goldRequestInbox.minutesLeft', { minutes }),
  };
};

export function GoldRequestNotificationModal({
  isOpen,
  onClose,
  onRequestComplete,
}: GoldRequestNotificationModalProps) {
  // Mounted from the global sidebar, so strings live in the always-loaded
  // `common` namespace to avoid suspending every page on `social`.
  const { t, i18n } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<{
    incoming: GoldRequest[];
    outgoing: GoldRequest[];
  }>({
    incoming: [],
    outgoing: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { user, forceUpdate } = useUser();
  const locale = user?.locale ?? (i18n.language as Locales);

  const timeLeft = useMemo<Record<number, ExpiryState>>(
    () =>
      Object.fromEntries(
        requests.incoming
          .filter((r) => r.stats.expiresAt)
          .map((r) => [r.id, formatExpiry(r.stats.expiresAt, t)]),
      ),
    // `tick` forces a recompute every minute so countdowns stay fresh.
    [requests.incoming, tick, t],
  );

  const fetchRequests = useCallback(async () => {
    try {
      const [incomingRes, outgoingRes] = await Promise.all([
        fetch('/api/social/gold-requests?incoming=true'),
        fetch('/api/social/gold-requests?outgoing=true'),
      ]);

      const incoming = incomingRes.ok ? await incomingRes.json() : [];
      const outgoing = outgoingRes.ok ? await outgoingRes.json() : [];

      setRequests({ incoming, outgoing });
    } catch {
      setError(t('goldRequestInbox.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
    }
  }, [fetchRequests, isOpen]);

  useEffect(() => {
    if (isOpen && requests.incoming.length > 0) {
      const timer = setInterval(() => {
        setTick((value) => value + 1);
      }, 60000);

      return () => clearInterval(timer);
    }
  }, [isOpen, requests.incoming.length]);

  const respondToRequest = useCallback(
    async (
      requestId: number,
      action: 'accept' | 'decline',
      message?: string,
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/social/gold-requests/${requestId}/respond`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, message }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || t('goldRequestInbox.responseFailed'),
          );
        }

        forceUpdate();
        await fetchRequests();
        onRequestComplete();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t('goldRequestInbox.responseFailed'),
        );
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests, forceUpdate, onRequestComplete, t],
  );

  const goldBadge = (amount: bigint) => (
    <Badge color="blue" variant="light">
      {t('currency.goldAmount', { amount: formatGold(amount, locale) })}
    </Badge>
  );

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={t('goldRequestInbox.title')}
      size="lg"
    >
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      <Stack gap="md">
        {requests.incoming.length > 0 && (
          <div>
            <Text size="lg" mb="md">
              {t('goldRequestInbox.incoming')}
            </Text>
            <Stack gap="md">
              {requests.incoming.map((request) => {
                const expiry = timeLeft[request.id];
                const expired = expiry?.expired === true;
                return (
                  <Card key={request.id} p="md" withBorder bg="var(--ot-inset)">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={600}>{request.from_user.display_name}</Text>
                        {goldBadge(request.gold_amount)}
                      </Group>

                      {request.stats.senderNote && (
                        <Text size="sm" c="dimmed">
                          {request.stats.senderNote}
                        </Text>
                      )}

                      {request.stats.expiresAt && (
                        <Group justify="space-between" align="center">
                          <Text size="xs" c="dimmed">
                            {t('goldRequestInbox.expires', {
                              time:
                                expiry?.label ?? t('goldRequestInbox.loading'),
                            })}
                          </Text>
                          {expired && (
                            <Badge color="red" size="xs">
                              {t('goldRequestInbox.expired')}
                            </Badge>
                          )}
                        </Group>
                      )}

                      <Group justify="flex-end" mt="md">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() =>
                            respondToRequest(request.id, 'decline')
                          }
                          disabled={loading || expired}
                        >
                          {t('goldRequestInbox.decline')}
                        </Button>
                        <Button
                          size="sm"
                          color="green"
                          onClick={() => respondToRequest(request.id, 'accept')}
                          loading={loading}
                          disabled={expired}
                        >
                          {t('goldRequestInbox.accept')}
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          </div>
        )}

        {requests.outgoing.length > 0 && (
          <div>
            <Text size="lg" mb="md">
              {t('goldRequestInbox.outgoing')}
            </Text>
            <Stack gap="md">
              {requests.outgoing.map((request) => (
                <Card key={request.id} p="md" withBorder bg="var(--ot-inset)">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={600}>{request.to_user.display_name}</Text>
                      {goldBadge(request.gold_amount)}
                    </Group>

                    {request.stats.senderNote && (
                      <Text size="sm" c="dimmed">
                        {request.stats.senderNote}
                      </Text>
                    )}

                    <Text size="xs" c="dimmed">
                      {t('goldRequestInbox.sent', {
                        date: new Date(request.date_time).toLocaleDateString(
                          locale,
                        ),
                      })}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {requests.incoming.length === 0 && requests.outgoing.length === 0 && (
          <Text ta="center" size="lg" c="var(--ot-muted)">
            {t('goldRequestInbox.empty')}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
