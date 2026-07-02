import { Box } from '@mantine/core';
import type { ReactNode } from 'react';

type BattleLedgerProps = {
  children: ReactNode;
};

/** Battle ledger. */
export function BattleLedger({ children }: BattleLedgerProps) {
  return (
    <Box
      style={{
        position: 'relative',
        padding: '28px clamp(18px, 3vw, 42px)',
        border: '1px solid rgba(201, 166, 89, 0.35)',
        backgroundImage: `
          linear-gradient(180deg, rgba(20, 15, 10, 0.86), rgba(8, 7, 6, 0.94)),
          url('/assets/images/ui/battle-report/backgrounds/bg-ledger-brown.webp')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow:
          'inset 0 0 60px rgba(0,0,0,0.55), 0 18px 45px rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}
    >
      <Box
        aria-hidden
        style={{
          position: 'absolute',
          inset: 10,
          border: '1px solid rgba(201, 166, 89, 0.22)',
          pointerEvents: 'none',
        }}
      />

      <Box style={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Box>
  );
}
