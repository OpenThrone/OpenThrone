import type { TooltipProps } from '@mantine/core';
import { Box, Tooltip } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';

interface ActionTooltipProps extends Omit<TooltipProps, 'children' | 'label'> {
  /** Tooltip copy; an empty label renders the action without a tooltip. */
  label?: ReactNode;
  children: ReactNode;
  /** Layout for the wrapper (e.g. `alignSelf`), which replaces the child in flex/grid flow. */
  wrapperStyle?: CSSProperties;
  /** Let a `fullWidth` action fill its cell. */
  fullWidth?: boolean;
}

/**
 * Tooltip for an action that may be disabled. Disabled buttons fire no
 * pointer events, so the tooltip is anchored to an inline wrapper instead.
 */
export function ActionTooltip({
  label,
  children,
  disabled,
  wrapperStyle,
  fullWidth = false,
  ...tooltipProps
}: ActionTooltipProps) {
  return (
    <Tooltip
      label={label}
      disabled={disabled || !label}
      withArrow
      {...tooltipProps}
    >
      <Box
        component="span"
        display={fullWidth ? 'block' : 'inline-flex'}
        style={wrapperStyle}
      >
        {children}
      </Box>
    </Tooltip>
  );
}
