import React, { forwardRef } from 'react';
import { Indicator, Tooltip, UnstyledButton } from '@mantine/core';
import RpgAwesomeIcon from './RpgAwesomeIcon';

interface Props {
  count?: number;
  onClick?: () => void;
  size?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * SocialIcon
 * - shows the ra-double-team icon
 * - displays a red indicator / badge when count > 0
 * - accessible and keyboard operable
 */
const SocialIcon = forwardRef<HTMLButtonElement, Props>(({
  count = 0,
  onClick,
  size = 20,
  className = '',
  ariaLabel = 'Friend requests',
}, ref) => {
  const show = (count ?? 0) > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <Tooltip label={ariaLabel} position="bottom" withArrow>
      <Indicator
        color="red"
        label={show ? (count && count > 99 ? '99+' : String(count)) : undefined}
        size={show ? 18 : 8}
        position="top-end"
        offset={4}
        processing={false}
        withBorder
        aria-hidden={!show}
      >
        <UnstyledButton
          ref={ref}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          className={`social-icon-button ${className}`}
          aria-label={ariaLabel}
          role="button"
        >
          <RpgAwesomeIcon icon="double-team" fw style={{ fontSize: size }} />
        </UnstyledButton>
      </Indicator>
    </Tooltip>
  );
});

SocialIcon.displayName = 'SocialIcon';

export default SocialIcon;