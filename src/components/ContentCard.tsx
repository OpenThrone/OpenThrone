import React, { ReactNode } from 'react';
import { Divider, Paper, Text, ThemeIcon, PaperProps } from '@mantine/core';

interface ContentCardProps extends Omit<PaperProps, 'className' | 'children'> {
  title?: string;
  icon?: ReactNode;
  variant?: 'default' | 'highlight' | 'secondary' | 'news';
  children: ReactNode;
  className?: string;
  iconPosition?: 'left' | 'right' | 'title-left';
  iconVariant?: 'default' | 'outline' | 'subtle' | 'transparent';
  fullHeight?: boolean;
  titleSize?: 'sm' | 'md' | 'lg' | 'xl';
  actions?: ReactNode;
  /** Optional close handler — when provided a close button will be shown in the header */
  onClose?: () => void;
  footer?: ReactNode;
  titlePosition?: 'left' | 'right' | 'center';
  bodyPadding?: string;
  /** Minimum width (px or CSS value) applied to the card root */
  minWidth?: number | string;
  /** Minimum height (px or CSS value) applied to the card root */
  minHeight?: number | string;
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
  bodyPadding = 'p-4',
  minWidth = 320,
  minHeight = 160,
  // Spread the remaining Mantine PaperProps
  shadow = 'md',
  radius = 'md',
  withBorder = true,
  onClose,
  ...otherProps
}) => {
  // extract any style passed by caller so we can merge
  const { style: otherStyle, ...restPaperProps } = otherProps as any;
  // Create class string based on variant
  const getCardClasses = () => {
    const base = `bg-[#071014] border border-gray-800 overflow-hidden transition-shadow duration-200 ${fullHeight ? 'h-full flex flex-col' : ''} ${className}`;
    if (variant === 'highlight') return `${base} ring-2 ring-yellow-500/30 border-yellow-500`;
    if (variant === 'secondary') return `${base} border-gray-700 bg-[#0b0b0b]`;
    if (variant === 'news') return `${base} bg-gradient-to-b from-[#071018] to-[#071016] shadow-lg rounded-xl border-transparent`;
    return base;
  };

  // Component for title with icon (for title-left position)
  const TitleWithIcon = () => (
    <div className="flex items-center gap-2">
      <ThemeIcon c="white" variant={iconVariant} className="hover:rotate-12 transition-transform duration-300">
        {icon}
      </ThemeIcon>
      <Text size={titleSize} fw="bold" c="dimmed" className="font-medieval tracking-wide">
        {title}
      </Text>
    </div>
  );

  // Get header justification class based on titlePosition
  const getHeaderJustifyClass = () => (titlePosition === 'right' ? 'justify-end' : 'justify-between');

  // compute min size styles (allow number => pixels or raw string)
  const sizeStyle: React.CSSProperties = {};
  if (minWidth !== undefined) sizeStyle.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;
  if (minHeight !== undefined) sizeStyle.minHeight = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;

  return (
    <Paper 
      withBorder={withBorder} 
      radius={radius} 
      shadow={shadow}
      p={0} 
      className={getCardClasses()}
      style={{ ...sizeStyle, ...(otherStyle || {}) }}
      {...restPaperProps}
    >
      {/* Header: render if there is a title or actions */}
      {(title || actions) && (
        <div
          role="group"
          aria-label={title ? `${title} card header` : 'card header'}
          className={`bg-[#0b0d0d] flex items-center px-4 py-3 border-b border-gray-800 relative ${getHeaderJustifyClass()}`}
        >
          {/* Left area: icon + title (normal flow) */}
          <div className="flex items-center gap-2">
            {icon && iconPosition === 'left' && (
              <ThemeIcon c="white" variant={iconVariant} className="hover:rotate-12 transition-transform duration-300 mr-2" aria-hidden>
                {icon}
              </ThemeIcon>
            )}

            {title && titlePosition !== 'center' && (iconPosition === 'title-left' ? <TitleWithIcon /> : (
              <Text size={titleSize} fw="bold" c="dimmed" className="font-medieval tracking-wide">
                {title}
              </Text>
            ))}
          </div>

          {/* Centered title (absolute so actions stay to the right) */}
          {title && titlePosition === 'center' && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <Text size={titleSize} fw="bold" c="dimmed" className="font-medieval tracking-wide text-center">
                {title}
              </Text>
            </div>
          )}

          {/* Right side actions / icon */}
          <div className="ml-auto flex items-center gap-2">
            {actions && (
              <div role="toolbar" aria-label="card actions" className="flex items-center gap-2">
                {actions}
              </div>
            )}

            {onClose && !actions && (
              <button
                onClick={onClose}
                aria-label={title ? `Close ${title}` : 'Close card'}
                className="text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 rounded"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {icon && iconPosition === 'right' && (
              <ThemeIcon c="white" variant={iconVariant} className="hover:rotate-12 transition-transform duration-300" aria-hidden>
                {icon}
              </ThemeIcon>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className={`${bodyPadding} flex-grow`}>{children}</div>

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