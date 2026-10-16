import {
  ActionIcon,
  type ActionIconProps,
  Indicator,
  Tooltip,
} from '@mantine/core';
import React, { forwardRef } from 'react';

import classes from './HeaderIconButton.module.css';

type HeaderIconButtonProps = ActionIconProps & {
  label: string;
  count?: number;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  'data-testid'?: string;
};

const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  (
    { label, count = 0, children, 'data-testid': testId, ...actionIconProps },
    ref,
  ) => {
    const show = count > 0;
    const badge = count > 99 ? '99+' : count > 9 ? '9+' : String(count);

    const button = (
      <ActionIcon
        size={40}
        radius="sm"
        variant="subtle"
        aria-label={label}
        data-testid={testId}
        ref={ref}
        className={classes.button}
        {...actionIconProps}
      >
        {children}
      </ActionIcon>
    );

    return (
      <Tooltip
        label={label}
        position="bottom"
        withArrow
        events={{ hover: true, focus: true, touch: false }}
      >
        <Indicator
          disabled={!show}
          label={show ? badge : undefined}
          color="red"
          size={16}
          offset={6}
          position="top-end"
          withBorder
        >
          {button}
        </Indicator>
      </Tooltip>
    );
  },
);

HeaderIconButton.displayName = 'HeaderIconButton';
export default HeaderIconButton;
