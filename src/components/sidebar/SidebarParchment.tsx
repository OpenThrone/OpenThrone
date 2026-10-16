import { Image, Paper } from '@mantine/core';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { getArtworkUrl } from '@/utils/artwork';

import classes from './SidebarParchment.module.css';

/** Keep parchment ink readable before loading, in pure mode, and after errors. */
export default function SidebarParchment({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const source = getArtworkUrl('images/background/advisor-scroll-side.webp');
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = source && failedSource !== source;
  const artworkLoaded = showImage && loadedSource === source;

  return (
    <Paper
      className={`${classes.parchment} ${className}`}
      data-sidebar-parchment
      data-artwork={artworkLoaded ? 'scroll' : 'plain'}
      styles={{
        root: {
          background: artworkLoaded
            ? 'transparent'
            : 'color-mix(in srgb, var(--ot-heading) 75%, var(--ot-inset))',
          color: 'var(--ot-inset)',
          border: artworkLoaded
            ? '1px solid transparent'
            : '1px solid color-mix(in srgb, var(--ot-inset) 25%, transparent)',
          borderRadius: artworkLoaded ? 0 : 'var(--mantine-radius-sm)',
          boxShadow: artworkLoaded ? 'none' : '0 6px 14px rgba(0, 0, 0, .35)',
        },
      }}
    >
      {showImage && (
        <Image
          src={source}
          alt=""
          aria-hidden="true"
          draggable={false}
          fit="fill"
          className={classes.art}
          onLoad={() => setLoadedSource(source)}
          onError={() => setFailedSource(source)}
        />
      )}
      <div className={classes.content}>{children}</div>
    </Paper>
  );
}
