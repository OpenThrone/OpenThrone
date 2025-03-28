// src/components/SessionModal.tsx
import { Modal, Table, Button, Text, Group, Switch, Loader } from '@mantine/core';
import { useState, useEffect, useCallback } from 'react';
import { alertService } from '@/services';

interface Session {
  id: number;
  createdAt: string;
  lastActivityAt: string;
}

interface SessionModalProps {
  opened: boolean;
  onClose: () => void;
}

const SessionModal: React.FC<SessionModalProps> = ({ opened, onClose }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);

  const AUTO_REFRESH_INTERVAL = 5; // seconds

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/recruit/listSessions');
      const data = await response.json();
      if (response.ok) {
        setSessions(data.sessions);
        if (autoRefresh) {
          setCountdown(AUTO_REFRESH_INTERVAL);
        }
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (opened) {
      fetchSessions();
    } else {
      setAutoRefresh(false);
      setCountdown(0);
    }
  }, [fetchSessions, opened]);

  useEffect(() => {
    let countdownTimer: NodeJS.Timeout | null = null;

    if (autoRefresh) {
      setCountdown(AUTO_REFRESH_INTERVAL);
      countdownTimer = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown > 1) {
            return prevCountdown - 1;
          } else {
            // Countdown reached zero, refresh sessions
            fetchSessions();
            return AUTO_REFRESH_INTERVAL;
          }
        });
      }, 1000);
    } else {
      setCountdown(0);
    }

    return () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
      }
    };
  }, [autoRefresh, fetchSessions]);

  const endSession = async (sessionId: number) => {
    try {
      const response = await fetch('/api/recruit/endSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (response.ok) {
        setSessions(sessions.filter((s) => s.id !== sessionId));
        alertService.success('Session ended');
      } else {
        const data = await response.json();
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to end session');
    }
  };

  const handleAutoRefresh = (checked: boolean) => {
    setAutoRefresh(checked);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Active Sessions"
      size="lg"
    >
      <Group mb="xs" align="center">
        <Switch
          label={
            <Text
              size="sm"
              color="dimmed"
              mb="md"
              style={{ width: '130px', display: 'inline-block' }}
            >
              {autoRefresh ? `Refreshing in ${countdown}s` : 'Enable Auto-Refresh'}
            </Text>
          }
          checked={autoRefresh}
          onChange={(event) => handleAutoRefresh(event.currentTarget.checked)}
        />
        <Button onClick={fetchSessions} loading={loading}>
          Refresh
        </Button>
      </Group>
      {loading && sessions.length === 0 ? (
        <Loader />
      ) : sessions.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Created At</th>
              <th>Last Activity</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.id}</td>
                <td>{new Date(session.createdAt).toLocaleString()}</td>
                <td>{new Date(session.lastActivityAt).toLocaleString()}</td>
                <td>
                  <Button
                    color="red"
                    size="xs"
                    onClick={() => endSession(session.id)}
                  >
                    End Session
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Text>No active sessions.</Text>
      )}
    </Modal>
  );
};

export default SessionModal;
