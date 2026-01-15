import { ActionIcon, Indicator, Tooltip } from '@mantine/core';
import React, { forwardRef } from 'react';

type HeaderIconButtonProps = {
  label: string;
  count?: number;
  children: React.ReactNode;
  'data-testid'?: string;
};

const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  ({ label, count = 0, children, 'data-testid': testId }, ref) => {
    const show = count > 0;
    const badge = count > 99 ? '99+' : count > 9 ? '9+' : String(count);

    const button = (
      <ActionIcon
        size={34}
        radius={10}
        variant="subtle"
        aria-label={label}
        data-testid={testId}
        ref={ref}
        className="toolbar-icon" // reuse your existing styling if you want
      >
        {children}
      </ActionIcon>
    );

    return (
      <Tooltip label={label} position="bottom" withArrow>
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
