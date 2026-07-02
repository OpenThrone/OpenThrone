import { Group, Text, Title } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useRef, useState } from 'react';

import type UserModel from '@/models/Users';
import {
  getOTTime,
  getTimeRemaining,
  getTimeToNextTurn,
} from '@/utils/timefunctions';

// Define the medieval font style to be used with Mantine components
const medievalFontStyle = { fontFamily: 'MedievalSharp, cursive' };

export interface SidebarTimeInfoProps {
  user: UserModel | null;
  userLoading: boolean;
  isMobile?: boolean;
  inkColor?: string;
}

export const SidebarTimeInfo = React.memo(function SidebarTimeInfo({
  user,
  userLoading,
  isMobile,
  inkColor,
}: SidebarTimeInfoProps) {
  const { t } = useTranslation('common');
  const [time, setTime] = useState('--:--');
  const [OTTime, setOTTime] = useState('--:--');
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Only show '--:--' on initial load before we have user data
    if ((!user || userLoading) && !hasInitializedRef.current) {
      return;
    }

    // Once we have user data, we'll start the timer and never go back to '--:--'
    if (user && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
    }

    const updateTimes = () => {
      const nextTurnTime = getTimeToNextTurn();
      const remaining = getTimeRemaining(nextTurnTime);

      // Format the time
      const minutes = String(remaining.minutes).padStart(2, '0');
      const seconds = String(remaining.seconds).padStart(2, '0');

      setTime(`${minutes}:${seconds}`);
      setOTTime(
        getOTTime().toLocaleTimeString(user?.locale ?? 'en-US', {
          timeStyle: 'short',
          hour12: false,
        }),
      );
    };

    // Update immediately
    updateTimes();

    // Then set interval for updates
    const interval = setInterval(updateTimes, 1000);

    return () => clearInterval(interval);
  }, [user, userLoading]);

  const labelOrder = isMobile ? 6 : 5;
  const valueOrder = isMobile ? 5 : 4;
  const otValueOrder = isMobile ? 4 : 3;

  const timeStyle = inkColor
    ? { ...medievalFontStyle, color: inkColor }
    : medievalFontStyle;

  return (
    <>
      <Title order={labelOrder} className="text-center" style={timeStyle}>
        {t('sidebar.timeUntilNextTurn')}
      </Title>
      <Title order={valueOrder} ta="center" fw="bold" style={timeStyle}>
        <span id="nextTurnTimestamp">{time}</span>
      </Title>

      <Title order={labelOrder} className="text-center" style={timeStyle}>
        {t('sidebar.otTime')}
      </Title>
      <Title order={otValueOrder} ta="center" fw="bold" style={timeStyle}>
        <span id="otTime">{OTTime}</span>
      </Title>
    </>
  );
});

export type StatRowVariant = 'classic' | 'scroll';

export interface StatRowProps {
  label: string;
  value: string | React.ReactNode;
  icon?: React.ReactNode;
  variant?: StatRowVariant;
  isMobile?: boolean;
  inkColor?: string;
}

// Stat Row Component for consistent styling and layout
export const StatRow: React.FC<StatRowProps> = ({
  label,
  value,
  icon,
  variant = 'classic',
  isMobile,
  inkColor,
}) => {
  const isScroll = variant === 'scroll';
  const gap = isScroll ? (isMobile ? 'xs' : 'sm') : 'xs';
  const size = isScroll ? (isMobile ? 'sm' : 'md') : 'md';
  const iconPaddingLeft = isScroll ? '4px' : '5px';
  const valuePaddingRight = isScroll ? (isMobile ? '6px' : '10px') : '10px';
  const labelColor = isScroll ? inkColor : 'black';
  const valueColor = isScroll ? inkColor : undefined;

  return (
    <Group justify="space-between" wrap="nowrap" gap={gap}>
      <Group gap="xs" wrap="nowrap">
        {icon && (
          <span
            className="w-4 text-center"
            style={{ paddingLeft: iconPaddingLeft }}
          >
            {icon}
          </span>
        )}{' '}
        {/* Icon wrapper */}
        <Text size={size} c={labelColor} fw="bold" lh="xs">
          {label}
        </Text>
      </Group>
      {React.isValidElement(value) ? (
        <div
          className="flex items-end"
          style={{ paddingRight: valuePaddingRight, color: valueColor }}
        >
          {value}
        </div>
      ) : (
        <Text
          size={size}
          c={valueColor}
          fw="bold"
          ta="right"
          pr={valuePaddingRight}
        >
          {value}
        </Text>
      )}
    </Group>
  );
};
