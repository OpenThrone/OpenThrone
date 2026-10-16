import type { PaperProps } from '@mantine/core';
import { Box, CloseButton, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type React from 'react';
import { memo } from 'react';

import classes from '@/components/game/Panels.module.css';

interface ContentCardProps extends Omit<PaperProps, 'className' | 'children'> {
  title?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'highlight' | 'secondary' | 'news';
  children: React.ReactNode;
  className?: string;
  iconPosition?: 'left' | 'right' | 'title-left';
  iconVariant?: 'default' | 'outline' | 'subtle' | 'transparent';
  fullHeight?: boolean;
  titleSize?: 'sm' | 'md' | 'lg' | 'xl';
  actions?: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  titlePosition?: 'left' | 'right' | 'center';
  bodyPadding?: string;
  minWidth?: number | string;
  minHeight?: number | string;
  style?: React.CSSProperties;
}

function ContentCard({
  title,
  icon,
  variant = 'default',
  children,
  className = '',
  iconPosition = 'right',
  iconVariant = 'outline',
  fullHeight = false,
  titleSize = 'lg',
  actions,
  footer,
  titlePosition = 'left',
  bodyPadding = 'p-4',
  minWidth = 0,
  minHeight = 160,
  radius = 'sm',
  withBorder = true,
  onClose,
  style,
  ...others
}: ContentCardProps) {
  const { t } = useTranslation('common');
  const iconNode = icon && (
    <ThemeIcon
      c="var(--ot-brand-text)"
      variant={iconVariant}
      aria-hidden="true"
    >
      {icon}
    </ThemeIcon>
  );
  return (
    <Paper
      radius={radius}
      withBorder={withBorder}
      p={0}
      className={[
        classes.card,
        variant === 'highlight' ? classes.highlight : '',
        variant === 'secondary' ? classes.secondary : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        minWidth,
        minHeight,
        height: fullHeight ? '100%' : 'auto',
        borderColor: variant === 'highlight' ? 'var(--ot-accent)' : undefined,
        ...style,
      }}
      {...others}
    >
      {(title || actions || onClose) && (
        <Box className={classes.header}>
          <Group
            gap="xs"
            wrap="nowrap"
            style={{
              minWidth: 0,
              flex: 1,
              justifyContent:
                titlePosition === 'center'
                  ? 'center'
                  : titlePosition === 'right'
                    ? 'flex-end'
                    : 'flex-start',
            }}
          >
            {iconPosition !== 'right' && iconNode}
            {title && (
              <Text component="h2" size={titleSize} className={classes.title}>
                {title}
              </Text>
            )}
          </Group>
          <Group gap="xs">
            {actions}
            {onClose && !actions && (
              <CloseButton
                onClick={onClose}
                aria-label={`${t('actions.close')} ${title ?? ''}`.trim()}
              />
            )}
            {iconPosition === 'right' && iconNode}
          </Group>
        </Box>
      )}
      <Box className={`${bodyPadding} min-w-0 grow`}>{children}</Box>
      {footer && <Box className={classes.footer}>{footer}</Box>}
    </Paper>
  );
}

export default memo(ContentCard);
