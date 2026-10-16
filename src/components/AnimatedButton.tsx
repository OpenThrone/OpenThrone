import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Flex, Tooltip } from '@mantine/core';

type ButtonColor =
  | 'blue'
  | 'red'
  | 'green'
  | 'yellow'
  | 'teal'
  | 'violet'
  | 'gray'
  | 'dark';
interface AnimatedButtonItem {
  icon: IconDefinition;
  label: string;
  onClick?: () => void;
  color?: ButtonColor;
  tooltip?: string;
  ariaLabel?: string;
  disabled?: boolean;
}
interface AnimatedButtonsProps {
  buttons: AnimatedButtonItem[];
  orientation?: 'horizontal' | 'vertical';
  spacing?: number | string;
}

/** Shared action controls with one keyboard focus stop per action. */
export default function AnimatedButtons({
  buttons,
  orientation = 'horizontal',
  spacing = 'md',
}: AnimatedButtonsProps) {
  return (
    <Flex
      direction={orientation === 'vertical' ? 'column' : 'row'}
      gap={spacing}
      wrap="wrap"
    >
      {buttons.map(
        (
          { icon, label, onClick, color, tooltip, ariaLabel, disabled = false },
          index,
        ) => (
          <Tooltip
            key={`${label}-${index}`}
            label={tooltip || label}
            withArrow
            openDelay={250}
            events={{ hover: true, focus: true, touch: false }}
          >
            <ActionIcon
              type="button"
              variant="subtle"
              color={color}
              size={44}
              onClick={onClick}
              aria-label={ariaLabel || label}
              disabled={disabled}
            >
              <FontAwesomeIcon icon={icon} />
            </ActionIcon>
          </Tooltip>
        ),
      )}
    </Flex>
  );
}
