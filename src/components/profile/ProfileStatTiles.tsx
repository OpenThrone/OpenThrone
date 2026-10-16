import type React from 'react';

import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';

import classes from './Profile.module.css';

export type ProfileStat = {
  key: string;
  label: string;
  value: React.ReactNode;
  icon: string; // RPG Awesome icon name.
};

/** Icon-led stat tiles; collapse to a ledger list in narrow containers. */
export function ProfileStatTiles({
  stats,
  columns = 2,
}: {
  stats: ProfileStat[];
  columns?: 2 | 3;
}) {
  return (
    <div className={classes.tilesWrap}>
      <dl className={classes.tiles} data-columns={columns}>
        {stats.map(({ key, label, value, icon }) => (
          <div key={key} className={classes.tile}>
            <RpgAwesomeIcon
              aria-hidden
              icon={icon}
              className={classes.tileIcon}
            />
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
