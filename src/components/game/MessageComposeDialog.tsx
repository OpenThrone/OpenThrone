import { faPaperPlane, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Avatar,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';

import styles from '@/components/game/ChatThemed.module.css';

export interface MessageRecipient {
  value: string;
  label: string;
  image?: string | null;
  race?: string;
  class?: string;
}

interface MessageComposeDialogProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: () => void;
  title: string;
  availableUsers: MessageRecipient[];
  selectedUsers: string[];
  onUsersChange: (users: string[]) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  message: string;
  onMessageChange: (value: string) => void;
  groupName: string;
  onGroupNameChange: (value: string) => void;
  error?: string;
  loading?: boolean;
  submitting?: boolean;
  isAddingToExistingChat?: boolean;
  isDirectMessage?: boolean;
}

/** Presentation shared by live chat and the API-free visual guide. */
export default function MessageComposeDialog({
  opened,
  onClose,
  onSubmit,
  title,
  availableUsers,
  selectedUsers,
  onUsersChange,
  searchValue,
  onSearchChange,
  message,
  onMessageChange,
  groupName,
  onGroupNameChange,
  error = '',
  loading = false,
  submitting = false,
  isAddingToExistingChat = false,
  isDirectMessage = false,
}: MessageComposeDialogProps) {
  const { t } = useTranslation('messaging');
  // Custom item renderer for MultiSelect
  const renderOption = (item: { option: MessageRecipient }) => {
    const { image, label, race, class: userClass } = item.option;
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
      closeOnEscape={!submitting}
      closeOnClickOutside={!submitting}
      withCloseButton={!submitting}
      onClose={onClose}
      title={title}
      size="md"
      classNames={{
        content: styles.modalContent,
        header: styles.modalHeader,
        body: styles.modalBody,
      }}
      centered
    >
      <Stack gap="md">
        {error ? (
          <Text c="red" role="alert">
            {error}
          </Text>
        ) : null}
        <MultiSelect
          data={availableUsers}
          value={selectedUsers}
          onChange={onUsersChange}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          placeholder={t('newMessageModal.searchPlaceholder')}
          label={t('newMessageModal.recipients')}
          searchable
          clearable
          disabled={submitting}
          nothingFoundMessage={
            loading ? <Loader size="xs" /> : t('newMessageModal.noUsersFound')
          }
          maxDropdownHeight={200}
          renderOption={renderOption}
          classNames={{ pill: styles.recipientPill }}
          data-testid="user-search"
        />

        {(isAddingToExistingChat && isDirectMessage) ||
        (!isAddingToExistingChat && selectedUsers.length > 1) ? (
          <TextInput
            label={t('newMessageModal.groupName')}
            placeholder={t('newMessageModal.groupNamePlaceholder')}
            value={groupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            disabled={submitting}
            required={isDirectMessage || selectedUsers.length > 1}
            data-testid="group-name"
          />
        ) : null}

        {!isAddingToExistingChat || isDirectMessage ? (
          <Textarea
            label={t('newMessageModal.message')}
            placeholder={t('input.placeholder')}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            disabled={submitting}
            autosize
            minRows={4}
            maxRows={5}
            required={!isAddingToExistingChat}
            data-testid="message-input"
          />
        ) : null}

        <Group justify="flex-end" mt="md" className={styles.modalFooter}>
          <Button
            variant="default"
            disabled={submitting}
            onClick={onClose}
            leftSection={<FontAwesomeIcon icon={faTimes} />}
          >
            {t('newMessageModal.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            loading={submitting}
            disabled={
              selectedUsers.length === 0 ||
              (!isAddingToExistingChat && !message.trim()) ||
              ((isDirectMessage ||
                (!isAddingToExistingChat && selectedUsers.length > 1)) &&
                !groupName.trim())
            }
            leftSection={<FontAwesomeIcon icon={faPaperPlane} />}
          >
            {isAddingToExistingChat
              ? isDirectMessage
                ? t('newMessageModal.createGroup')
                : t('newMessageModal.addPeople')
              : t('newMessageModal.send')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
