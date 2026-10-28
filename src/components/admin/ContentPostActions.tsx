import {
  faEdit,
  faNewspaper,
  faScroll,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';

type ContentPostActionsProps = {
  status: string;
  onEdit: () => void;
  onArchive: () => void;
  onPublish: () => void;
  onDelete: () => void;
};

export function ContentPostActions({
  status,
  onEdit,
  onArchive,
  onPublish,
  onDelete,
}: ContentPostActionsProps) {
  const { t } = useTranslation('admin-content');
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip
        label={t('content.edit')}
        withArrow
        events={{ hover: true, focus: true, touch: false }}
      >
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          onClick={onEdit}
          aria-label={t('content.edit')}
        >
          <FontAwesomeIcon icon={faEdit} size="xs" />
        </ActionIcon>
      </Tooltip>
      {status !== 'ARCHIVED' && (
        <Tooltip
          label={t('content.archive')}
          withArrow
          events={{ hover: true, focus: true, touch: false }}
        >
          <ActionIcon
            size="sm"
            variant="subtle"
            color="orange"
            onClick={onArchive}
            aria-label={t('content.archive')}
          >
            <FontAwesomeIcon icon={faScroll} size="xs" />
          </ActionIcon>
        </Tooltip>
      )}
      {status === 'DRAFT' && (
        <Tooltip
          label={t('content.publish')}
          withArrow
          events={{ hover: true, focus: true, touch: false }}
        >
          <ActionIcon
            size="sm"
            variant="subtle"
            color="green"
            onClick={onPublish}
            aria-label={t('content.publish')}
          >
            <FontAwesomeIcon icon={faNewspaper} size="xs" />
          </ActionIcon>
        </Tooltip>
      )}
      <Tooltip
        label={t('content.delete')}
        withArrow
        events={{ hover: true, focus: true, touch: false }}
      >
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onDelete}
          aria-label={t('content.delete')}
        >
          <FontAwesomeIcon icon={faTrash} size="xs" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
