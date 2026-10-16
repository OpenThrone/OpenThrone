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
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useUser } from '@/context/users';

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

const formatExpiry = (expiresAt: string): string => {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
};

export function GoldRequestNotificationModal({
  isOpen,
  onClose,
  onRequestComplete,
}: GoldRequestNotificationModalProps) {
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
  const { forceUpdate } = useUser();

  const timeLeft = useMemo(
    () =>
      Object.fromEntries(
        requests.incoming
          .filter((r) => r.stats.expiresAt)
          .map((r) => [r.id, formatExpiry(r.stats.expiresAt)]),
      ),
    [requests.incoming, tick],
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
      setError('Failed to load requests');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
    }
  }, [fetchRequests, isOpen]);

  useEffect(() => {
    if (isOpen && requests.incoming.length > 0) {
      const timer = setInterval(() => {
        setTick((t) => t + 1);
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
          throw new Error(errorData.error || 'Response failed');
        }

        forceUpdate();
        await fetchRequests();
        onRequestComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Response failed');
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests, forceUpdate, onRequestComplete],
  );

  return (
    <Modal opened={isOpen} onClose={onClose} title="Gold Requests" size="lg">
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      <Stack gap="md">
        {requests.incoming.length > 0 && (
          <div>
            <Text size="lg" mb="md">
              Incoming Requests
            </Text>
            <Stack gap="md">
              {requests.incoming.map((request) => (
                <Card
                  key={request.id}
                  p="md"
                  className="border border-gray-700 bg-gray-800"
                >
                  <Stack gap="xs">
                    <Group justify="apart">
                      <Text className="font-semibold">
                        {request.from_user.display_name}
                      </Text>
                      <Badge color="blue" variant="light">
                        {request.gold_amount.toLocaleString()} gold
                      </Badge>
                    </Group>

                    {request.stats.senderNote && (
                      <Text size="sm" color="dimmed">
                        {request.stats.senderNote}
                      </Text>
                    )}

                    {request.stats.expiresAt && (
                      <Group justify="space-between" align="center">
                        <Text size="xs" color="dimmed">
                          Expires: {timeLeft[request.id] || 'Loading...'}
                        </Text>
                        {timeLeft[request.id] === 'Expired' && (
                          <Badge color="red" size="xs">
                            Expired
                          </Badge>
                        )}
                      </Group>
                    )}

                    <Group justify="right" mt="md">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondToRequest(request.id, 'decline')}
                        disabled={loading || timeLeft[request.id] === 'Expired'}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        color="green"
                        onClick={() => respondToRequest(request.id, 'accept')}
                        loading={loading}
                        disabled={timeLeft[request.id] === 'Expired'}
                      >
                        Accept
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {requests.outgoing.length > 0 && (
          <div>
            <Text size="lg" mb="md">
              Your Requests
            </Text>
            <Stack gap="md">
              {requests.outgoing.map((request) => (
                <Card
                  key={request.id}
                  p="md"
                  className="border border-gray-700 bg-gray-800"
                >
                  <Stack gap="xs">
                    <Group justify="apart">
                      <Text className="font-semibold">
                        {request.to_user.display_name}
                      </Text>
                      <Badge color="blue" variant="light">
                        {request.gold_amount.toLocaleString()} gold
                      </Badge>
                    </Group>

                    {request.stats.senderNote && (
                      <Text size="sm" color="dimmed">
                        {request.stats.senderNote}
                      </Text>
                    )}

                    <Text size="xs" color="dimmed">
                      Sent: {new Date(request.date_time).toLocaleDateString()}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {requests.incoming.length === 0 && requests.outgoing.length === 0 && (
          <Text className="text-center text-lg text-gray-400">
            No gold requests
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
