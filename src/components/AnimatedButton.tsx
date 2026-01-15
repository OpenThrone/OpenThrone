import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Group, Tooltip, useMantineTheme } from '@mantine/core';

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

export default function AnimatedButtons({
  buttons,
  orientation = 'horizontal',
  spacing = 'md',
}: AnimatedButtonsProps) {
  const theme = useMantineTheme();
  // Use explicit prop shaping for Mantine Group
  const groupProps: any =
    orientation === 'vertical' ? { direction: 'column', spacing } : { spacing };

  return (
    <Group {...groupProps}>
      {buttons.map(
        (
          {
            icon,
            label,
            onClick,
            color = 'blue',
            tooltip,
            ariaLabel,
            disabled = false,
          },
          idx,
        ) => (
          <Tooltip
            key={label + idx}
            label={tooltip || label}
            withArrow
            position="bottom"
            disabled={!tooltip}
          >
            <button
              type="button"
              className={`
                group relative flex items-center justify-center
                rounded-md
                bg-transparent px-3 py-2
                transition
                hover:bg-gray-800
                focus:outline-none
                disabled:cursor-not-allowed disabled:opacity-50
              `}
              onClick={onClick}
              aria-label={ariaLabel || label}
              disabled={disabled}
              style={{
                border: '1px solid transparent',
                width: 48,
                height: 48,
              }}
            >
              <ActionIcon
                variant="subtle"
                color={color}
                size="lg"
                className="pointer-events-none"
                aria-hidden="true"
                radius="md"
              >
                <FontAwesomeIcon icon={icon} size="lg" />
              </ActionIcon>
              <span
                className={`
                  pointer-events-none
                  absolute left-1/2 top-0
                  -translate-x-1/2 -translate-y-full
                  rounded bg-gray-900/90
                  px-2 py-1
                  text-sm
                  ${
                    (theme as any).colorScheme === 'dark'
                      ? 'text-blue-200'
                      : 'text-blue-700'
                  }
                  z-20
                  whitespace-nowrap
                  font-medium
                  opacity-0 shadow-lg
                  transition-opacity
                  duration-200
                  group-hover:opacity-100
                `}
              >
                {label}
              </span>
            </button>
          </Tooltip>
        ),
      )}
    </Group>
  );
}
