import { Modal, Table, Button, Text, Group, Switch, Loader, Center } from '@mantine/core';
import { useState, useEffect, useCallback } from 'react';
import { alertService } from '@/services';
import { logError } from '@/utils/logger';

/**
 * Represents an active user session.
 */
interface Session {
  id: number;
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Props for the SessionModal component.
 */
interface SessionModalProps {
  /** Whether the modal is currently open. */
  opened: boolean;
  /** Function to call when the modal should be closed. */
  onClose: () => void;
}

/**
 * A modal component to display and manage active user sessions (e.g., auto-recruit).
 * Allows users to view session details and manually end sessions.
 * Includes an auto-refresh feature.
 */
const SessionModal: React.FC<SessionModalProps> = ({ opened, onClose }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [endingSessionId, setEndingSessionId] = useState<number | null>(null);
  const [endSessionError, setEndSessionError] = useState<string | null>(null);

  /** Interval for auto-refreshing session data in seconds. */
  const AUTO_REFRESH_INTERVAL = 5;

  /**
   * Fetches the list of active sessions from the API.
   * Updates the component state with the fetched sessions or displays an error.
   * Resets the auto-refresh countdown if enabled.
   */
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

  /**
   * Sends a request to the API to end a specific session.
   * Updates the session list on success or displays an error message.
   * Manages loading state for the specific session being ended.
   * @param sessionId - The ID of the session to end.
   */
  const endSession = async (sessionId: number) => {
    if (endingSessionId) return; // Prevent multiple simultaneous end requests
    setEndingSessionId(sessionId);
    setEndSessionError(null);
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
        setEndSessionError(data.error || 'Failed to end session.');
      }
    } catch (error: any) {
       setEndSessionError('Network error: Failed to end session.');
       logError('End session error:', error); // Log the error
    } finally {
        setEndingSessionId(null); // Clear loading state for this session
    }
  };

  /**
   * Toggles the auto-refresh state based on the Switch component's change event.
   * @param checked - The new checked state of the auto-refresh switch.
   */
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
      {/* Display End Session Error */}
      {endSessionError && (
          <Text color="red" size="sm" mt="xs" mb="xs" ta="center">
              {endSessionError}
          </Text>
      )}
      {/* Session Table or Loading/Empty State */}
      {loading && sessions.length === 0 ? (
        <Center><Loader /></Center> // Center loader
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
                    loading={endingSessionId === session.id}
                    disabled={endingSessionId !== null}
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
