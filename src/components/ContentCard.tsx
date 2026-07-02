import type { PaperProps } from '@mantine/core';
import { Divider, Paper, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import React from 'react';

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
  onClose?: () => void;
  footer?: ReactNode;
  titlePosition?: 'left' | 'right' | 'center';
  bodyPadding?: string;
  minWidth?: number | string;
  minHeight?: number | string;
  style?: React.CSSProperties;
}

interface TitleWithIconProps {
  icon: ReactNode;
  iconVariant: 'default' | 'outline' | 'subtle' | 'transparent';
  title: string;
  titleSize: 'sm' | 'md' | 'lg' | 'xl';
}

function TitleWithIcon({
  icon,
  iconVariant,
  title,
  titleSize,
}: TitleWithIconProps) {
  return (
    <div className="flex items-center gap-2">
      <ThemeIcon
        c="white"
        variant={iconVariant}
        className="transition-transform duration-300 hover:rotate-12"
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
  footer = null,
  titlePosition = 'left',
  bodyPadding = 'p-4',
  minWidth = 320,
  minHeight = 160,
  shadow = 'md',
  radius = 'md',
  withBorder = true,
  onClose,
  ...otherProps
}: ContentCardProps) {
  const { style: rawStyle, ...restPaperProps } = otherProps;
  const otherStyle = rawStyle as React.CSSProperties | undefined;

  // Create class string based on variant
  const getCardClasses = () => {
    const base = `bg-[#071014] border border-gray-800 overflow-hidden transition-shadow duration-200 ${fullHeight ? 'h-full flex flex-col' : ''} ${className}`;
    if (variant === 'highlight')
      return `${base} ring-2 ring-yellow-500/30 border-yellow-500`;
    if (variant === 'secondary') return `${base} border-gray-700 bg-[#0b0b0b]`;
    if (variant === 'news')
      return `${base} bg-gradient-to-b from-[#071018] to-[#071016] shadow-lg rounded-xl border-transparent`;
    return base;
  };

  // Get header justification class based on titlePosition
  const getHeaderJustifyClass = () =>
    titlePosition === 'right' ? 'justify-end' : 'justify-between';

  const mergedStyle = React.useMemo<React.CSSProperties>(() => {
    const sizeStyle: React.CSSProperties = {};
    if (minWidth !== undefined)
      sizeStyle.minWidth =
        typeof minWidth === 'number' ? `${minWidth}px` : minWidth;
    if (minHeight !== undefined)
      sizeStyle.minHeight =
        typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
    return { ...sizeStyle, ...otherStyle };
  }, [minWidth, minHeight, otherStyle]);

  return (
    <Paper
      withBorder={withBorder}
      radius={radius}
      shadow={shadow}
      p={0}
      className={getCardClasses()}
      style={mergedStyle}
      {...restPaperProps}
    >
      {/* Header: render if there is a title or actions */}
      {(title || actions) && (
        <div
          role="group"
          aria-label={title ? `${title} card header` : 'card header'}
          className={`relative flex items-center border-b border-gray-800 bg-[#0b0d0d] px-4 py-3 ${getHeaderJustifyClass()}`}
        >
          {/* Left area: icon + title (normal flow) */}
          <div className="flex items-center gap-2">
            {icon && iconPosition === 'left' && (
              <ThemeIcon
                c="white"
                variant={iconVariant}
                className="mr-2 transition-transform duration-300 hover:rotate-12"
                aria-hidden
              >
                {icon}
              </ThemeIcon>
            )}

            {title &&
              titlePosition !== 'center' &&
              (iconPosition === 'title-left' ? (
                <TitleWithIcon
                  icon={icon}
                  iconVariant={iconVariant}
                  title={title}
                  titleSize={titleSize}
                />
              ) : (
                <Text
                  size={titleSize}
                  fw="bold"
                  c="dimmed"
                  className="font-medieval tracking-wide"
                >
                  {title}
                </Text>
              ))}
          </div>

          {/* Centered title (absolute so actions stay to the right) */}
          {title && titlePosition === 'center' && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Text
                size={titleSize}
                fw="bold"
                c="dimmed"
                className="text-center font-medieval tracking-wide"
              >
                {title}
              </Text>
            </div>
          )}

          {/* Right side actions / icon */}
          <div className="ml-auto flex items-center gap-2">
            {actions && (
              <div
                role="toolbar"
                aria-label="card actions"
                className="flex items-center gap-2"
              >
                {actions}
              </div>
            )}

            {onClose && !actions && (
              <button
                onClick={onClose}
                aria-label={title ? `Close ${title}` : 'Close card'}
                className="rounded text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
              >
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M6 6l12 12M6 18L18 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}

            {icon && iconPosition === 'right' && (
              <ThemeIcon
                c="white"
                variant={iconVariant}
                className="transition-transform duration-300 hover:rotate-12"
                aria-hidden
              >
                {icon}
              </ThemeIcon>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className={`${bodyPadding} grow`}>{children}</div>

      {/* Footer Section */}
      {footer && (
        <>
          <Divider color="#554813" />
          <div className="bg-[#10100f]/60 px-4 py-3">{footer}</div>
        </>
      )}
    </Paper>
  );
}

export default React.memo(ContentCard);
