import { Box, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import Image from '@/components/ArtworkImage';
import frameClasses from '@/components/game/FantasyFrame.module.css';
import classes from '@/components/public/PublicPages.module.css';

interface PublicAuthLayoutProps {
  title: string;
  description: string;
  formTitle: string;
  sceneChildren?: ReactNode;
  children: ReactNode;
}

export default function PublicAuthLayout({
  title,
  description,
  formTitle,
  sceneChildren,
  children,
}: PublicAuthLayoutProps) {
  return (
    <Box className={classes.page}>
      <Box
        className={`${classes.authLayout} ${frameClasses.surface} ${frameClasses.ornate}`}
      >
        <Box component="section" className={classes.authScene}>
          <Image
            src="/assets/images/ui/public/throne-room.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 600px"
            className={classes.authArt}
          />
          <Title order={2} className={classes.heroTitle}>
            {title}
          </Title>
          <Text className={classes.heroDescription}>{description}</Text>
          {sceneChildren}
        </Box>
        <Box component="section" className={classes.authForm}>
          <Title order={2} className={classes.sectionTitle}>
            {formTitle}
          </Title>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
