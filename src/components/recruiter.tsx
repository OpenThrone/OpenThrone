import { Box, Text } from '@mantine/core';
import { Turnstile } from '@marsidev/react-turnstile';
import { useTranslation } from 'next-i18next';
import React, { useEffect } from 'react';

import Image from '@/components/ArtworkImage';
import { GameCard } from '@/components/game/GameCard';
import { getAssetPath, getLevelFromXP } from '@/utils/utilities';

const Recruiter = ({ user, showCaptcha, onSuccess, status }) => {
  const { t } = useTranslation('common');
  useEffect(() => {
    if (!showCaptcha) {
      // Automatically succeed after 3 seconds if no captcha is required
      const timeout = setTimeout(() => {
        onSuccess();
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [showCaptcha, onSuccess]);

  return (
    <GameCard title={t('recruit.targetTitle')}>
      <Box className="mb-5 place-content-center items-center text-center">
        <Text>
          {t('recruit.targetSummary', {
            name: user.display_name,
            level: getLevelFromXP(user.experience),
            race: user.race,
            class: user.class,
          })}
        </Text>
        <center>
          <Image
            src={getAssetPath('shields', '150x150', user.race)}
            width="150"
            height="150"
            alt=""
          />
        </center>
        {status && (
          <Text mt="xs" size="lg" fw={600} c="green.3">
            {status}
          </Text>
        )}
      </Box>
      <Box className="flex items-center justify-center">
        <div className="container mx-auto text-center">
          {showCaptcha && (
            <div className="flex items-center justify-center">
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
                onSuccess={onSuccess}
              />
            </div>
          )}
        </div>
      </Box>
    </GameCard>
  );
};

export default Recruiter;
