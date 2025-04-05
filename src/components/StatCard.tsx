import React, { ReactNode } from 'react';
import { Paper, Text, ThemeIcon } from '@mantine/core';

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

  const iconNode = ( // Create the icon node once
    <ThemeIcon
      c="white"
      variant="outline"
      className="hover:rotate-12 transition-transform duration-300"
    >
      {icon}
    </ThemeIcon>
  );

  return (
    <Paper withBorder radius="md" p={0} className={getCardClasses()}>
      {/* Header */}
      <div className="bg-[#10100f] relative flex items-center justify-between px-4 py-2 border-b border-[#554813]">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-100/5 to-transparent pointer-events-none" />
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
      <div className="flex flex-col items-center justify-center px-4 py-4 text-[#fbd753]">
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