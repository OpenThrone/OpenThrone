import { Box } from '@mantine/core';
import Image from 'next/image';
import type { ReactNode } from 'react';

type OrnatePanelProps = {
  children: ReactNode;
  minHeight?: number;
};

/** Ornate panel. */
export function OrnatePanel({ children, minHeight = 280 }: OrnatePanelProps) {
  return (
    <Box
      style={{
        position: 'relative',
        minHeight,
        padding: '34px 42px',
        isolation: 'isolate',
      }}
    >
      <Image
        src="/assets/images/ui/battle-report/frames/panel-frame-blue.webp"
        alt=""
        fill
        sizes="100vw"
        style={{
          objectFit: 'fill',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      <Box
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
