import React from 'react';
import clsx from 'clsx';

interface RpgAwesomeIconProps {
  icon: string;
  size?: 'xs' | 'sm' | 'lg' | '1x' | '2x' | '3x' | '4x' | '5x';
  className?: string;
  color?: string;
  style?: React.CSSProperties;
  fw?: boolean;
  spin?: boolean;
  pulse?: boolean;
  border?: boolean;
  fixedWidth?: boolean;
  inverse?: boolean;
  flip?: 'horizontal' | 'vertical' | 'both';
  stack?: '1x' | '2x';
  onClick?: () => void;
}

/**
 * A React component for using RPG-Awesome icons
 * with a similar API to FontAwesomeIcon
 */
const RpgAwesomeIcon: React.FC<RpgAwesomeIconProps> = ({
  icon,
  size,
  className = '',
  style = {},
  color,
  fw = false,
  spin = false,
  pulse = false,
  border = false,
  fixedWidth = false,
  inverse = false,
  flip,
  stack,
  onClick,
  ...rest
}) => {
  // Build the class string with all the features
  const classes = clsx(
    'ra',
    `ra-${icon}`,
    {
      'ra-fw': fw || fixedWidth,
      'ra-spin': spin,
      'ra-pulse': pulse,
      'ra-border': border,
      'ra-inverse': inverse,
      [`ra-${size}`]: size,
      [`ra-flip-${flip}`]: flip,
      [`ra-stack-${stack}`]: stack,
    },
    className
  );

  // Merge style with color if provided
  const mergedStyle = color
    ? { ...style, color }
    : style;

  return (
    <i 
      className={classes} 
      style={mergedStyle} 
      onClick={onClick} 
      {...rest} 
    />
  );
};

export default RpgAwesomeIcon;