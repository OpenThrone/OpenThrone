import type React from 'react';
import { forwardRef } from 'react';

import Image from '@/components/ArtworkImage';
import { themes } from '@/styles/themes';
import type { PlayerRace } from '@/types/typings';
import type { AvatarFraming } from '@/utils/avatarFraming';
import { avatarFramingStyle, splitAvatarFraming } from '@/utils/avatarFraming';
import { getAssetPath } from '@/utils/utilities';

import classes from './Profile.module.css';

type ProfilePortraitProps = React.HTMLAttributes<HTMLDivElement> & {
  race?: string;
  /** Stored avatar value; may carry a `#frame=` fragment. */
  avatar?: string | null;
  /** Overrides the stored framing (used by the framing editor). */
  framing?: AvatarFraming | null;
};

/** Race frame around a player's portrait, or their race crest when they have none. */
export const ProfilePortrait = forwardRef<HTMLDivElement, ProfilePortraitProps>(
  function ProfilePortrait(
    { race, avatar, framing, className, ...others },
    ref,
  ) {
    const raceKey = (race ?? 'ELF').toUpperCase() as PlayerRace;
    const stored = splitAvatarFraming(avatar);
    // UserModel swaps a missing avatar for the small shield asset.
    const isShield =
      !stored.src ||
      stored.src === 'SHIELD' ||
      stored.src.includes('/shields/');
    const src = isShield
      ? getAssetPath('shields', null, raceKey)
      : stored.src.startsWith('blob:')
        ? stored.src
        : encodeURI(stored.src);

    return (
      <div
        ref={ref}
        className={[classes.portrait, className].filter(Boolean).join(' ')}
        {...others}
      >
        <div
          className={classes.portraitWindow}
          data-kind={isShield ? 'crest' : 'portrait'}
          style={
            {
              '--crest': themes[raceKey]?.colors?.brand?.[6],
            } as React.CSSProperties
          }
        >
          <Image
            className={classes.portraitImage}
            src={src}
            alt=""
            fill
            sizes="300px"
            priority
            unoptimized={!isShield}
            draggable={false}
            style={
              isShield
                ? undefined
                : avatarFramingStyle(
                    framing === undefined ? stored.framing : framing,
                  )
            }
          />
        </div>
        <Image
          className={classes.portraitFrame}
          src={getAssetPath('avatarFrame', null, raceKey)}
          alt=""
          width={1536}
          height={1024}
          sizes="420px"
          priority
        />
      </div>
    );
  },
);
