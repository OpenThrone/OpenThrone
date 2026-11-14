import { Box, Text } from '@mantine/core';
import { Turnstile } from '@marsidev/react-turnstile';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useRef } from 'react';

import AltchaChallenge from '@/components/AltchaChallenge';
import Image from '@/components/ArtworkImage';
import { GameCard } from '@/components/game/GameCard';
import { getAssetPath, getLevelFromXP } from '@/utils/utilities';

const Recruiter = ({
  user,
  showCaptcha,
  captchaProvider = 'turnstile',
  onSuccess,
  status,
}) => {
  const { t } = useTranslation('common');
  const firedRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const succeedOnce = (token?: string) => {
    if (firedRef.current) return;
    firedRef.current = true;
    onSuccessRef.current(token);
  };
  useEffect(() => {
    if (!showCaptcha) {
      // Automatically succeed after 3 seconds if no captcha is required
      const timeout = setTimeout(() => {
        succeedOnce();
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [showCaptcha]);

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
              {captchaProvider === 'altcha' ? (
                <AltchaChallenge
                  onVerified={succeedOnce}
                  // Auto-recruit checks once per session (see auto-recruit.tsx),
                  // so this per-target path never shows a failure of its own.
                  onFailed={() => undefined}
                />
              ) : (
                <Turnstile
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
                  onSuccess={succeedOnce}
                />
              )}
            </div>
          )}
        </div>
      </Box>
    </GameCard>
  );
};

export default Recruiter;
