import { useTranslation } from 'next-i18next';

import Image from '@/components/ArtworkImage';
import frameClasses from '@/components/game/FantasyFrame.module.css';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';

import classes from './Profile.module.css';
import { ProfilePortrait } from './ProfilePortrait';

// Per-race throne rooms; ELF shares the public About hero painting.
const RACE_BACKDROPS: Record<string, string> = {
  ELF: '/assets/images/ui/public/throne-room.webp',
  HUMAN: '/assets/images/ui/profile/throne-human.webp',
  UNDEAD: '/assets/images/ui/profile/throne-undead.webp',
  GOBLIN: '/assets/images/ui/profile/throne-goblin.webp',
};

const RACE_ICONS: Record<string, string> = {
  ELF: 'leaf',
  HUMAN: 'knight-helmet',
  UNDEAD: 'skull',
  GOBLIN: 'horns',
};

type ProfileHeroProps = {
  name: string;
  race?: string;
  playerClass?: string;
  avatar?: string | null;
  level: number;
  rank: number | string;
  isOnline: boolean;
  statusLabel: string;
  lastActive: string;
};

/** Identity banner: framed portrait, name, lineage, rank and presence. */
export function ProfileHero({
  name,
  race,
  playerClass,
  avatar,
  level,
  rank,
  isOnline,
  statusLabel,
  lastActive,
}: ProfileHeroProps) {
  const { t } = useTranslation('common');
  const raceKey = (race ?? 'ELF').toUpperCase();

  return (
    <section
      className={`${classes.hero} ${frameClasses.surface} ${frameClasses.ornate}`}
      aria-label={name}
    >
      <Image
        src={RACE_BACKDROPS[raceKey] ?? RACE_BACKDROPS.ELF}
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1200px"
        className={classes.heroArt}
      />
      <div className={classes.heroScrim} aria-hidden="true" />
      <div className={classes.heroInner}>
        <ProfilePortrait race={raceKey} avatar={avatar} />

        <div className={classes.identity}>
          <h2 className={classes.name}>{name}</h2>
          <div className={classes.lineage}>
            <RpgAwesomeIcon
              aria-hidden
              icon={RACE_ICONS[raceKey] ?? 'player'}
              className={classes.factIcon}
              style={{ fontSize: '1.375rem' }}
            />
            <span>{`${race ?? ''} ${playerClass ?? ''}`.trim()}</span>
          </div>

          <dl className={classes.facts}>
            <div className={classes.fact}>
              <RpgAwesomeIcon
                aria-hidden
                icon="crown"
                className={classes.factIcon}
              />
              <div>
                <dt>{t('profileSummary.level', { defaultValue: 'Level' })}</dt>
                <dd>{level}</dd>
              </div>
            </div>
            <div className={classes.fact}>
              <RpgAwesomeIcon
                aria-hidden
                icon="trophy"
                className={classes.factIcon}
              />
              <div>
                <dt>
                  {t('profileSummary.rank', { defaultValue: 'Overall Rank' })}
                </dt>
                <dd>{rank}</dd>
              </div>
            </div>
          </dl>

          <div className={classes.presence}>
            <span className={classes.status}>
              <span
                className={classes.dot}
                data-state={isOnline ? 'online' : 'offline'}
                aria-hidden="true"
              />
              {statusLabel}
            </span>
            <span className={classes.lastSeen}>
              {t('profileSummary.lastOnline', { defaultValue: 'Last Online' })}
              <strong>{lastActive}</strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
