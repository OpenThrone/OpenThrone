import { Paper, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  variant?: 'default' | 'highlight' | 'pulse';
  subtext?: string;
  iconPosition?: 'left' | 'right';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  variant = 'default',
  subtext,
  iconPosition = 'right',
}) => {
  const getCardClasses = () => {
    const baseClasses = `
      bg-[#0b0c0c] 
      border border-[#554813] 
      rounded-sm 
      shadow-md 
      overflow-hidden
      hover:shadow-lg 
      hover:scale-[1.02] 
      transition-all duration-300 ease-in-out
    `;

    switch (variant) {
      case 'highlight':
        return `
          ${baseClasses}
          border-2 border-yellow-600
          ring-2 ring-yellow-500/40
        `;
      case 'pulse':
        return `
          ${baseClasses}
          animate-pulse-slow
          border-yellow-500
        `;
      default:
        return baseClasses;
    }
  };

  const iconNode = // Create the icon node once
    (
      <ThemeIcon
        c="white"
        variant="outline"
        className="transition-transform duration-300 hover:rotate-12"
      >
        {icon}
      </ThemeIcon>
    );

  return (
    <Paper withBorder radius="md" p={0} className={getCardClasses()}>
      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-[#554813] bg-[#10100f] px-4 py-2">
        {/* eslint-disable-next-line tailwindcss/no-custom-classname */}
        <div className="bg-gradient-to-r pointer-events-none absolute inset-0 from-transparent via-yellow-100/5 to-transparent" />
        {iconPosition === 'left' && iconNode}
        <Text
          size="lg"
          fw="bold"
          c="dimmed"
          className="font-medieval tracking-wide"
        >
          {title}
        </Text>
        {iconPosition === 'right' && iconNode}
      </div>

      {/* Body */}
      <div className="flex flex-col items-center justify-center p-4 text-[#fbd753]">
        <Text size="xl" fw="bold">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Text>

        {subtext && (
          <Text size="sm" c="dimmed" mt="xs" ta="center">
            {subtext}
          </Text>
        )}
      </div>
    </Paper>
  );
};

export default StatCard;
