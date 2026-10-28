import { useLocalStorage } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';

import Image from '@/components/ArtworkImage';
import GameHeaderLoop from '@/components/GameHeaderLoop';
import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import type { PlayerRace } from '@/types/typings';
import { AppConfig } from '@/utils/AppConfig';
import { type FortDamageTier, getFortDamageTier } from '@/utils/fortDamage';
import { getAssetPath } from '@/utils/utilities';

import classes from './GameHeader.module.css';

/**
 * Preserve the saved artwork choice while following the active race theme.
 * The animated wall shows the signed-in player's fort damage; `damageTier`
 * overrides it for previews.
 */
export default function GameHeader({
  damageTier,
}: { damageTier?: FortDamageTier } = {}) {
  const { t } = useTranslation('common');
  const { raceClasses, authorized } = useLayout();
  const { user } = useUser();
  const [artwork] = useLocalStorage<string>({
    key: 'headerArtwork',
    defaultValue: 'v2',
  });
  const race = raceClasses.race as PlayerRace;
  const isClassic = artwork === 'classic';
  const tier =
    damageTier ??
    (authorized ? getFortDamageTier(user?.fortHealth?.percentage) : 0);
  const wall = (src: string, fallback?: ReactNode) => (
    <Image
      src={src}
      alt=""
      fill
      priority
      sizes="(max-width: 1536px) 100vw, 1536px"
      className={classes.wall}
      fallback={fallback}
    />
  );

  return (
    <div
      className={`${classes.hero} ${authorized ? raceClasses.bgClass : 'bg-elf-header-bgcolor'}`}
      data-artwork={isClassic ? 'classic' : 'v3'}
      data-fort-damage={isClassic ? undefined : tier}
    >
      {isClassic ? (
        wall(getAssetPath('wall-header', undefined, race))
      ) : (
        <>
          {/* Frame 1 of the loop, so the video fades in without a jump. */}
          {wall(
            `/assets/header/${race}-wall-header-v3-d${tier}-1536.webp`,
            wall(`/assets/header/${race}-wall-header-v2.webp`),
          )}
          <GameHeaderLoop race={race} tier={tier} className={classes.loop} />
          {tier > 0 && (
            // Fire glow and embers over a damaged wall; CSS only, static under reduced motion.
            <div className={classes.fx} aria-hidden="true">
              <span className={classes.glow} />
              {tier > 1 && (
                <>
                  <span className={classes.embers} />
                  <span className={`${classes.embers} ${classes.embersFar}`} />
                </>
              )}
            </div>
          )}
        </>
      )}
      <div className={classes.brand}>
        <Image
          src={getAssetPath('OpenThrone')}
          alt={t('app.title')}
          fallback={<h1 className={classes.wordmark}>{t('app.title')}</h1>}
          priority
          width={2524}
          height={1100}
          sizes="(max-width: 640px) 66vw, (max-width: 1536px) 42vw, 640px"
          className={classes.logo}
        />
        <h2 className={`${classes.subtitle} text-center`}>
          <span className={classes.subtitleText}>{AppConfig.description}</span>
        </h2>
      </div>
    </div>
  );
}
