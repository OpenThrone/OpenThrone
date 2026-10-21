import type { TextProps } from '@mantine/core';
import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

import classes from '@/components/game/Panels.module.css';

interface SectionHeadingProps extends Omit<TextProps, 'component'> {
  /** Heading level inside the card; GameCard titles are h2. */
  order?: 3 | 4 | 5;
  children: ReactNode;
}

/**
 * Sub-heading inside a GameCard. Mantine Title renders the blackletter page
 * face, so in-card sections use the card title's MedievalSharp instead.
 */
export function SectionHeading({
  order = 3,
  children,
  className,
  ...others
}: SectionHeadingProps) {
  return (
    <Text
      component={`h${order}`}
      className={[classes.sectionHeading, className].filter(Boolean).join(' ')}
      {...others}
    >
      {children}
    </Text>
  );
}
