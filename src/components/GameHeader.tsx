import { useLocalStorage } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';

import Image from '@/components/ArtworkImage';
import { useLayout } from '@/context/LayoutContext';
import type { PlayerRace } from '@/types/typings';
import { AppConfig } from '@/utils/AppConfig';
import { getAssetPath } from '@/utils/utilities';

import classes from './GameHeader.module.css';

/** Preserve the saved artwork choice while following the active race theme. */
export default function GameHeader() {
  const { t } = useTranslation('common');
  const { raceClasses, authorized } = useLayout();
  const [artwork] = useLocalStorage<string>({
    key: 'headerArtwork',
    defaultValue: 'v2',
  });
  const race = raceClasses.race as PlayerRace;
  const isV2 = artwork !== 'classic';
  const source = isV2
    ? `/assets/header/${race}-wall-header-v2.webp`
    : getAssetPath('wall-header', undefined, race);

  return (
    <div
      className={`${classes.hero} ${authorized ? raceClasses.bgClass : 'bg-elf-header-bgcolor'}`}
      data-artwork={isV2 ? 'v2' : 'classic'}
    >
      <Image
        src={source}
        alt=""
        fill
        priority
        sizes="(max-width: 1536px) 100vw, 1536px"
        className={classes.wall}
      />
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
