import { Box, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import Image from '@/components/ArtworkImage';
import frameClasses from '@/components/game/FantasyFrame.module.css';
import classes from '@/components/public/PublicPages.module.css';

interface PublicHeroProps {
  title: string;
  description: string;
  children?: ReactNode;
  imageSrc?: string;
}

export default function PublicHero({
  title,
  description,
  children,
  imageSrc = '/assets/images/ui/public/throne-room.webp',
}: PublicHeroProps) {
  return (
    <Box
      component="section"
      className={`${classes.hero} ${frameClasses.surface} ${frameClasses.ornate}`}
    >
      <Image
        src={imageSrc}
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1200px"
        className={classes.heroArt}
      />
      <Box className={classes.heroCopy}>
        <Title order={2} className={classes.heroTitle}>
          {title}
        </Title>
        <Text className={classes.heroDescription}>{description}</Text>
        {children}
      </Box>
    </Box>
  );
}
