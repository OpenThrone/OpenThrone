import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Box, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Short statement of what is missing, e.g. "No friends yet." */
  title: string;
  /** Optional hint about why it is empty or what to do next. */
  description?: ReactNode;
  /** FontAwesome icon definition or a custom node, shown muted above the title. */
  icon?: IconDefinition | ReactNode;
  /** Optional call to action, usually a Mantine Button. */
  action?: ReactNode;
  /** Tighter padding for use inside cards and table panels. */
  compact?: boolean;
}

const isIconDefinition = (
  value: EmptyStateProps['icon'],
): value is IconDefinition =>
  Boolean(value && typeof value === 'object' && 'iconName' in value);

/** Shared "nothing to show" panel for lists, tables and profile sections. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <Stack
      align="center"
      justify="center"
      gap={compact ? 4 : 'xs'}
      py={compact ? 'md' : 'xl'}
      px="md"
      ta="center"
      data-testid="empty-state"
    >
      {icon && (
        <Box c="var(--ot-muted)" fz={compact ? 20 : 28} aria-hidden="true">
          {isIconDefinition(icon) ? <FontAwesomeIcon icon={icon} /> : icon}
        </Box>
      )}
      <Text fw={600} c="var(--ot-heading)" size={compact ? 'sm' : 'md'}>
        {title}
      </Text>
      {description && (
        <Text size="sm" c="var(--ot-muted)" maw={420}>
          {description}
        </Text>
      )}
      {action && <Box mt="xs">{action}</Box>}
    </Stack>
  );
}

export default EmptyState;
