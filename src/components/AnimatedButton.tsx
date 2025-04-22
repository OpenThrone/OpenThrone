import { ActionIcon, Group, Tooltip, useMantineTheme } from "@mantine/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type ButtonColor =
  | "blue"
  | "red"
  | "green"
  | "yellow"
  | "teal"
  | "violet"
  | "gray"
  | "dark";

interface AnimatedButton {
  icon: IconDefinition;
  label: string;
  onClick?: () => void;
  color?: ButtonColor;
  tooltip?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

interface AnimatedButtonsProps {
  buttons: AnimatedButton[];
  orientation?: "horizontal" | "vertical";
  spacing?: number | string;
}

export default function AnimatedButtons({
  buttons,
  orientation = "horizontal",
  spacing = "md",
}: AnimatedButtonsProps) {
  const theme = useMantineTheme();
  const groupProps =
    orientation === "vertical"
      ? { direction: "column", spacing }
      : { spacing };

  return (
    <Group {...groupProps}>
      {buttons.map(
        (
          {
            icon,
            label,
            onClick,
            color = "blue",
            tooltip,
            ariaLabel,
            disabled = false,
          },
          idx
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
                bg-transparent
                px-3 py-2 rounded-md
                transition
                hover:bg-gray-800
                focus:outline-none
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              onClick={onClick}
              aria-label={ariaLabel || label}
              disabled={disabled}
              style={{
                border: "1px solid transparent",
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
                  px-2 py-1 rounded
                  bg-gray-900 bg-opacity-90
                  text-sm
                  ${theme.colorScheme === "dark"
                    ? "text-blue-200"
                    : "text-blue-700"
                  }
                  font-medium
                  opacity-0
                  group-hover:opacity-100
                  transition-opacity duration-200
                  z-20
                  shadow-lg
                  whitespace-nowrap
                `}
              >
                {label}
              </span>
            </button>
          </Tooltip>
        )
      )}
    </Group>
  );
}
