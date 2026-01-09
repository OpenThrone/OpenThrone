import React, { useEffect, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import Image from 'next/image';
import { Box, Text } from '@mantine/core';
import { GameCard } from '@/components/game/GameCard';
import { getLevelFromXP, getAssetPath } from '@/utils/utilities';

const Recruiter = ({ user, showCaptcha, onSuccess, status }) => {
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
    <GameCard title="Recruitment Target">
      <Box className="mb-5 text-center justify-center items-center content-center">
        <Text>
          {user.display_name} is a level {getLevelFromXP(user.experience)} {user.race} {user.class}.
        </Text>
        <center>
          <Image src={getAssetPath('shields', '150x150', user.race)} width={'150'} height={'150'} alt="" />
        </center>
        {status && (
          <Text className="mt-2 text-lg font-semibold text-green-400">{status}</Text>
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
