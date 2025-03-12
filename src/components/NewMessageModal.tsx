// Modal component for creating new messages or adding users to existing chats
import { useState, useEffect, useCallback } from 'react';
import { 
  Modal, 
  Button, 
  TextInput, 
  Textarea, 
  MultiSelect, 
  Avatar, 
  Text, 
  Group, 
  Loader, 
  Stack
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faTimes } from '@fortawesome/free-solid-svg-icons';

interface NewMessageModalProps {
  opened: boolean;
  onClose: () => void;
  onRoomCreated?: (roomId: number) => void;
  existingChatId?: number; // If provided, we're adding users to existing chat
  existingUsers?: number[]; // IDs of users already in the chat
  isDirectMessage?: boolean; // Whether this is modifying a direct message
}

const NewMessageModal = ({ 
  opened, 
  onClose, 
  onRoomCreated,
  existingChatId, 
  existingUsers = [],
  isDirectMessage = false
}: NewMessageModalProps) => {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [groupName, setGroupName] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchValue, 300);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Mode depends on whether we have an existingChatId
  const isAddingToExistingChat = !!existingChatId;
  
  // Title changes based on context
  const modalTitle = isAddingToExistingChat 
    ? (isDirectMessage ? "Create Group Chat" : "Add People to Chat") 
    : "New Message";

  // Wrap fetchUsers in useCallback
  const fetchUsers = useCallback(async (query: string) => {
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
        const filteredUsers = data.filter(user => !existingUsers.includes(user.id));
        
        // Format for MultiSelect
        const formattedUsers = filteredUsers.map(user => ({
          value: user.id.toString(),
          label: user.display_name,
          image: user.avatar,
          race: user.race,
          class: user.class,
        }));
        
        setAvailableUsers(formattedUsers);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, [existingUsers]);

  useEffect(() => {
    if (debouncedSearch.trim().length > 0) {
      fetchUsers(debouncedSearch);
    }
  }, [debouncedSearch, fetchUsers]);

  const handleSubmit = async () => {
    // Validate inputs
    if (selectedUsers.length === 0) return;
    if (!isAddingToExistingChat && !message.trim()) return;
    if (isDirectMessage && !groupName.trim()) return;
    
    setSubmitting(true);
    
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
                ...selectedUsers.map(id => parseInt(id, 10)) // New users
              ],
              message: message.trim() ? message : null, // Optional initial message
              isPrivate: true
            }),
          });
          
          const data = await response.json();
          if (data.id) {
            // Navigate to new chat
            window.location.href = `/messaging?roomId=${data.id}`;
          }
        } else {
          // Add users to existing group chat
          const response = await fetch(`/api/messages/${existingChatId}/participants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: selectedUsers.map(id => parseInt(id, 10))
            }),
          });
          
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
            name: groupName.trim() || null, // If no name, it's a direct message
            recipients: selectedUsers.map(id => parseInt(id, 10)),
            message,
            isPrivate: true
          }),
        });
        
        const data = await response.json();
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
      console.error("Error creating or modifying chat:", error);
    } finally {
      setSubmitting(false);
      onClose();
    }
  };

  const resetForm = () => {
    setSelectedUsers([]);
    setMessage('');
    setGroupName('');
    setSearchValue('');
    setAvailableUsers([]);
  };

  // Custom item renderer for MultiSelect
  const renderOption = (item: any) => {
    const { value, image, label, race, class: userClass } = item;
    return (
      <Group gap="sm">
        <Avatar src={image} radius="xl" size="sm">
          {label?.[0]?.toUpperCase() || '?'}
        </Avatar>
        <div>
          <Text size="sm">{label}</Text>
          <Text size="xs" opacity={0.5}>
            {race} {userClass}
          </Text>
        </div>
      </Group>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={modalTitle}
      size="md"
    >
      <Stack gap="md">
        <MultiSelect
          data={availableUsers}
          value={selectedUsers}
          onChange={setSelectedUsers}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          placeholder="Search for users..."
          label="Recipients"
          searchable
          clearable
          nothingFoundMessage={loading ? <Loader size="xs" /> : "No users found"}
          maxDropdownHeight={200}
          renderOption={renderOption}
          styles={(theme) => ({
            pill: {
              backgroundColor: theme.colors.blue[7],
              color: theme.white
            }
          })}
          data-testid="user-search"
        />

        {(isAddingToExistingChat && isDirectMessage) || (!isAddingToExistingChat && selectedUsers.length > 1) ? (
          <TextInput
            label="Group Name"
            placeholder="Enter a name for this group"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            required={isDirectMessage || selectedUsers.length > 1}
            data-testid="group-name"
          />
        ) : null}

        {!isAddingToExistingChat || (isDirectMessage && message.trim()) ? (
          <Textarea
            label="Message"
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            minRows={3}
            maxRows={5}
            required={!isAddingToExistingChat}
            data-testid="message-input"
          />
        ) : null}

        <Group gap="right" mt="md">
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onClose();
            }}
            leftSection={<FontAwesomeIcon icon={faTimes} />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={selectedUsers.length === 0 || (!isAddingToExistingChat && !message.trim())}
            leftSection={<FontAwesomeIcon icon={faPaperPlane} />}
          >
            {isAddingToExistingChat 
              ? (isDirectMessage ? "Create Group" : "Add People") 
              : "Send Message"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default NewMessageModal;