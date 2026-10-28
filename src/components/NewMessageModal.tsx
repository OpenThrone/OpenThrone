// Modal component for creating new messages or adding users to existing chats
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';

import MessageComposeDialog, {
  type MessageRecipient,
} from '@/components/game/MessageComposeDialog';
import { logError } from '@/utils/logger';

const EMPTY_EXISTING_USERS: number[] = [];

interface NewMessageModalProps {
  opened: boolean;
  onClose: () => void;
  onRoomCreated?: (roomId: number) => void;
  existingChatId?: number; // If provided, we're adding users to existing chat
  existingUsers?: number[]; // IDs of users already in the chat
  isDirectMessage?: boolean; // Whether this is modifying a direct message
  prefillRecipient?: {
    id: number;
    label?: string;
    image?: string | null;
    race?: string;
    class?: string;
  } | null;
}

const NewMessageModal = ({
  opened,
  onClose,
  onRoomCreated,
  existingChatId,
  existingUsers = EMPTY_EXISTING_USERS,
  isDirectMessage = false,
  prefillRecipient = null,
}: NewMessageModalProps) => {
  const { t } = useTranslation('messaging');
  const [error, setError] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [groupName, setGroupName] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchValue, 300);
  const [availableUsers, setAvailableUsers] = useState<MessageRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const submissionPending = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  // Mode depends on whether we have an existingChatId
  const isAddingToExistingChat = !!existingChatId;

  // Title changes based on context
  const modalTitle = isAddingToExistingChat
    ? isDirectMessage
      ? t('newMessageModal.titleCreateGroup')
      : t('newMessageModal.titleAddPeople')
    : t('newMessage');

  // Wrap fetchUsers in useCallback
  const fetchUsers = useCallback(
    async (query: string) => {
      if (!query.trim()) return;

      setLoading(true);
      try {
        const response = await fetch('/api/general/searchUsers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: query }),
        });

        if (response.ok) {
          const data = await response.json();

          // Filter out users that are already in the chat
          const filteredUsers = data.filter(
            (user) => !existingUsers.includes(user.id),
          );

          // Format for MultiSelect
          const formattedUsers = filteredUsers.map((user) => ({
            value: user.id.toString(),
            label: user.display_name,
            image: user.avatar,
            race: user.race,
            class: user.class,
          }));

          setAvailableUsers(formattedUsers);
        }
      } catch (error) {
        logError('Failed to fetch users:', error);
        setError(t('errorGeneric'));
      } finally {
        setLoading(false);
      }
    },
    [existingUsers, t],
  );

  useEffect(() => {
    if (debouncedSearch.trim().length > 0) {
      fetchUsers(debouncedSearch);
    }
  }, [debouncedSearch, fetchUsers]);

  useEffect(() => {
    if (!opened || !prefillRecipient?.id) return;
    const idStr = String(prefillRecipient.id);
    setSelectedUsers((prev) =>
      prev.includes(idStr) ? prev : [idStr, ...prev],
    );
    setAvailableUsers((prev) => {
      if (prev.some((u) => u.value === idStr)) return prev;
      return [
        {
          value: idStr,
          label: prefillRecipient.label || t('user', { id: idStr }),
          image: prefillRecipient.image || null,
          race: prefillRecipient.race,
          class: prefillRecipient.class,
        },
        ...prev,
      ];
    });
  }, [opened, prefillRecipient, t]);

  const handleSubmit = async () => {
    // Validate inputs
    if (selectedUsers.length === 0) return;
    if (!isAddingToExistingChat && !message.trim()) return;
    if (
      (isDirectMessage ||
        (!isAddingToExistingChat && selectedUsers.length > 1)) &&
      !groupName.trim()
    )
      return;

    if (submissionPending.current) return;
    submissionPending.current = true;
    setSubmitting(true);
    setError('');
    let succeeded = false;

    try {
      if (isAddingToExistingChat) {
        if (isDirectMessage) {
          // Create new group from direct message
          const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: groupName,
              recipients: [
                ...existingUsers, // Current participants
                ...selectedUsers.map((id) => parseInt(id, 10)), // New users
              ],
              message: message.trim() ? message : undefined, // Optional initial message
              isPrivate: true,
            }),
          });

          const data = await response.json();
          if (!response.ok || !data.id) {
            setError(
              typeof data.error === 'string' ? data.error : t('errorGeneric'),
            );
            return;
          }
          succeeded = true;
          if (data.id) {
            // Navigate to new chat
            window.location.href = `/messaging?roomId=${data.id}`;
          }
        } else {
          // Add users to existing group chat
          const response = await fetch(
            `/api/messages/${existingChatId}/participants`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userIds: selectedUsers.map((id) => parseInt(id, 10)),
              }),
            },
          );

          if (!response.ok) {
            setError(t('errorGeneric'));
            return;
          }
          succeeded = true;
          if (response.ok) {
            // Close modal and refresh chat list
            onClose();
            // You might want to trigger a refresh of the chat participant list
          }
        }
      } else {
        // Create a new chat
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupName.trim() || undefined, // If no name, it's a direct message
            recipients: selectedUsers.map((id) => parseInt(id, 10)),
            message,
            isPrivate: true,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.id) {
          setError(
            typeof data.error === 'string' ? data.error : t('errorGeneric'),
          );
          return;
        }
        succeeded = true;
        if (data.id) {
          // Call onRoomCreated if provided, otherwise navigate
          if (onRoomCreated) {
            onRoomCreated(data.id);
          } else {
            window.location.href = `/messaging?roomId=${data.id}`;
          }
        }
      }
    } catch (error) {
      logError('Error creating or modifying chat:', error);
      setError(t('errorGeneric'));
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
      if (succeeded) {
        onClose();
      }
    }
  };

  const resetForm = () => {
    setSelectedUsers([]);
    setMessage('');
    setGroupName('');
    setSearchValue('');
    setAvailableUsers([]);
    setError('');
  };

  return (
    <MessageComposeDialog
      opened={opened}
      onClose={() => {
        if (submissionPending.current) return;
        resetForm();
        onClose();
      }}
      onSubmit={handleSubmit}
      title={modalTitle}
      availableUsers={availableUsers}
      selectedUsers={selectedUsers}
      onUsersChange={setSelectedUsers}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      message={message}
      onMessageChange={setMessage}
      groupName={groupName}
      onGroupNameChange={setGroupName}
      error={error}
      loading={loading}
      submitting={submitting}
      isAddingToExistingChat={isAddingToExistingChat}
      isDirectMessage={isDirectMessage}
    />
  );
};

export default NewMessageModal;
