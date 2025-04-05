import React, { ReactNode } from 'react';
import { Divider, Paper, Text, ThemeIcon, PaperProps } from '@mantine/core';

interface ContentCardProps extends Omit<PaperProps, 'className' | 'children'> {
  title?: string;
  icon?: ReactNode;
  variant?: 'default' | 'highlight' | 'secondary';
  children: ReactNode;
  className?: string;
  iconPosition?: 'left' | 'right' | 'title-left';
  iconVariant?: 'default' | 'outline' | 'subtle' | 'transparent';
  fullHeight?: boolean;
  titleSize?: 'sm' | 'md' | 'lg' | 'xl';
  actions?: ReactNode;
  footer?: ReactNode;
  titlePosition?: 'left' | 'right' | 'center';
  bodyPadding?: number | string;
}

const ContentCard: React.FC<ContentCardProps> = ({
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
  footer = null,
  titlePosition = 'left',
  bodyPadding = '1rem',
  // Spread the remaining Mantine PaperProps
  shadow = 'md',
  radius = 'md',
  withBorder = true,
  ...otherProps
}) => {
  // Create class string based on variant
  const getCardClasses = () => {
    const baseClasses = `
      bg-[#0b0c0c] 
      border border-[#554813] 
      overflow-hidden
      hover:shadow-lg 
      transition-all duration-300 ease-in-out
      ${fullHeight ? 'h-full flex flex-col' : ''}
      ${className}
    `;

    switch (variant) {
      case 'highlight':
        return `
          ${baseClasses}
          border-2 border-yellow-600
          ring-2 ring-yellow-500/40
        `;
      case 'secondary':
        return `
          ${baseClasses}
          border-gray-700
        `;
      default:
        return baseClasses;
    }
  };

  // Component for title with icon (for title-left position)
  const TitleWithIcon = () => (
    <div className="flex items-center gap-2">
      <ThemeIcon
        c="white"
        variant={iconVariant}
        className="hover:rotate-12 transition-transform duration-300"
      >
        {icon}
      </ThemeIcon>
      <Text
        size={titleSize}
        fw="bold"
        c="dimmed"
        className="font-medieval tracking-wide"
      >
        {title}
      </Text>
    </div>
  );

  // Get header justification class based on titlePosition
  const getHeaderJustifyClass = () => {
    switch (titlePosition) {
      case 'left':
        return 'justify-between';
      case 'center':
        return 'justify-center';
      case 'right':
        return 'justify-end';
      default:
        return 'justify-between';
    }
  };

  return (
    <Paper 
      withBorder={withBorder} 
      radius={radius} 
      shadow={shadow}
      p={0} 
      className={getCardClasses()}
      {...otherProps}
    >
      {/* Header */}
      {title && (
        <div className={`bg-[#10100f] flex items-center px-4 py-2 border-b border-[#554813] ${getHeaderJustifyClass()}`}>
          {/* Left side content or centered content */}
          {(titlePosition === 'left' || titlePosition === 'center') && (
            <div className={`flex items-center ${titlePosition === 'center' ? 'mx-auto' : ''}`}>
              {icon && iconPosition === 'left' && (
                <ThemeIcon
                  c="white"
                  variant={iconVariant}
                  className="hover:rotate-12 transition-transform duration-300 mr-2"
                >
                  {icon}
                </ThemeIcon>
              )}
              
              {iconPosition === 'title-left' ? (
                <TitleWithIcon />
              ) : (
                <Text
                  size={titleSize}
                  fw="bold"
                  c="dimmed"
                  className={`font-medieval tracking-wide ${titlePosition === 'center' ? 'text-center' : ''}`}
                >
                  {title}
                </Text>
              )}
            </div>
          )}
          
          {/* Right side content */}
          {title && (titlePosition === 'left' || titlePosition === 'right') && (
            <div className="flex items-center gap-2">
              {/* When title is right-aligned, show it here */}
              {titlePosition === 'right' && (
                <div className="flex items-center">
                  {iconPosition === 'title-left' ? (
                    <TitleWithIcon />
                  ) : (
                    <Text
                      size={titleSize}
                      fw="bold"
                      c="dimmed"
                      className="font-medieval tracking-wide"
                    >
                      {title}
                    </Text>
                  )}
                </div>
              )}
              
              {actions && <div>{actions}</div>}
              {icon && iconPosition === 'right' && (
                <ThemeIcon
                  c="white"
                  variant={iconVariant}
                  className="hover:rotate-12 transition-transform duration-300"
                >
                  {icon}
                </ThemeIcon>
              )}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: bodyPadding }} className="flex-grow">
        {children}
      </div>

      {/* Footer Section */}
      {footer && (
        <>
          <Divider color="#554813" />
          <div className="px-4 py-3 bg-[#10100f]/60">
            {footer}
          </div>
        </>
      )}
    </Paper>
  );
};

export default ContentCard;