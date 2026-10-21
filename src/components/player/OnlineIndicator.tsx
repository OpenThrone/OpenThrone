import type { IndicatorProps } from '@mantine/core';
import { Box, Indicator, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';

/** Presence colours: online is teal, offline is a neutral muted grey. */
export const ONLINE_COLOR = 'var(--mantine-color-teal-5)';
export const OFFLINE_COLOR = 'var(--ot-muted)';

export type OnlineIndicatorProps = Omit<
  IndicatorProps,
  'color' | 'label' | 'children'
> & {
  online: boolean;
  /** Avatar (or other target) to decorate with a presence dot. */
  children?: ReactNode;
  /** Without children: show the status word beside the dot instead of hiding it. */
  withLabel?: boolean;
};

/**
 * Labelled presence marker. Wraps an avatar with a dot plus tooltip and
 * screen-reader text, or renders a standalone dot (optionally with the word).
 */
export function OnlineIndicator({
  online,
  children,
  withLabel = false,
  size = 10,
  ...indicatorProps
}: OnlineIndicatorProps) {
  const { t } = useTranslation('common');
  const label = online ? t('status.online') : t('status.offline');
  const color = online ? ONLINE_COLOR : OFFLINE_COLOR;

  if (children) {
    return (
      <Tooltip
        label={label}
        withArrow
        events={{ hover: true, focus: true, touch: true }}
      >
        <Indicator
          color={color}
          size={size}
          withBorder
          data-state={online ? 'online' : 'offline'}
          {...indicatorProps}
        >
          {children}
          <VisuallyHidden>{label}</VisuallyHidden>
        </Indicator>
      </Tooltip>
    );
  }

  return (
    <Text
      component="span"
      size="xs"
      c="var(--ot-muted)"
      display="inline-flex"
      style={{ alignItems: 'center', gap: 6 }}
      data-state={online ? 'online' : 'offline'}
    >
      <Box
        component="span"
        aria-hidden
        w={size}
        h={size}
        bg={color}
        style={{ borderRadius: '50%', flexShrink: 0 }}
      />
      {withLabel ? label : <VisuallyHidden>{label}</VisuallyHidden>}
    </Text>
  );
}

export default OnlineIndicator;
