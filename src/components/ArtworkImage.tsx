import type { ImageProps } from 'next/image';
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import { resolveArtworkSource } from '@/utils/artwork';

import classes from './ArtworkImage.module.css';

type ArtworkImageProps = Omit<ImageProps, 'src'> & {
  src: string;
  fallback?: ReactNode;
};

const ICONS: Record<string, string> = {
  home: 'castle',
  battle: 'crossed-swords',
  structures: 'tower',
  alliances: 'double-team',
  community: 'speech-bubbles',
  about: 'book',
  settings: 'cog',
  signout: 'player-teleport',
};

/** Retains image sizing and replaces failed or disabled artwork with local UI. */
export default function ArtworkImage({
  src,
  fallback,
  onError,
  ...props
}: ArtworkImageProps) {
  const resolved = resolveArtworkSource(src);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!resolved || resolved === failedSource) {
    if (fallback !== undefined) return <>{fallback}</>;
    const isCrest = src.includes('/shields/');
    const navKey = src.includes('/nav/')
      ? src.split('/').pop()?.split('.')[0]
      : undefined;
    if (!isCrest && !navKey) {
      if (!src.includes('/ui/public/') && !src.includes('/ui/profile/'))
        return null;
      return (
        <span
          className={classes.scene}
          data-artwork-fallback="scene"
          aria-hidden="true"
        >
          <RpgAwesomeIcon icon="castle" />
        </span>
      );
    }
    const race = src.match(/(ELF|HUMAN|UNDEAD|GOBLIN)/)?.[0];
    const icon = isCrest
      ? {
          ELF: 'leaf',
          HUMAN: 'knight-helmet',
          UNDEAD: 'skull',
          GOBLIN: 'horns',
        }[race ?? 'ELF']
      : (ICONS[navKey] ?? 'shield');
    return (
      <span
        role={props.alt ? 'img' : undefined}
        aria-label={props.alt || undefined}
        aria-hidden={props.alt ? undefined : true}
        className={`${props.className ?? ''} ${classes.fallback}`}
        data-crest={isCrest || undefined}
        style={
          {
            '--artwork-width': props.fill
              ? '100%'
              : props.width != null
                ? `${props.width}px`
                : undefined,
            '--artwork-height': props.fill
              ? '100%'
              : props.height != null
                ? `${props.height}px`
                : undefined,
            ...props.style,
          } as CSSProperties
        }
      >
        <RpgAwesomeIcon
          icon={icon}
          aria-hidden
          style={{ fontSize: 'inherit' }}
        />
      </span>
    );
  }
  return (
    <Image
      {...props}
      alt={props.alt}
      src={resolved}
      unoptimized={props.unoptimized ?? true}
      onError={(event) => {
        setFailedSource(resolved);
        onError?.(event);
      }}
    />
  );
}
