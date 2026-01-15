import { Button, Divider, Space, Text } from '@mantine/core';
import { Turnstile } from '@marsidev/react-turnstile';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { PlayerRace } from '@/types/typings';
import { logError } from '@/utils/logger';
import { getAssetPath } from '@/utils/utilities';

interface RecruitProps {
  id: string;
  display_name: string;
  level: number;
  class: string;
  race: string;
}

export default function Recruit(props) {
  const router = useRouter();
  const [error, setError] = useState(null);
  const autoRecruitParams = Array.isArray(router.query.auto_recruit)
    ? router.query.auto_recruit[0]
    : router.query.auto_recruit;
  const id = Array.isArray(router.query.id)
    ? router.query.id[0]
    : router.query.id;
  const [showCaptcha, setShowCaptcha] = useState(false);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [userInfo, setUserInfo] = useState<RecruitProps | null>(null);
  const { user, forceUpdate } = useUser();
  const { t } = useTranslation('common');

  const autoRecruit = useCallback(async () => {
    // Fetch the next recruitment link immediately
    const response = await fetch('/api/recruit/auto-recruit');
    const data = await response.json();
    if (data.error) {
      alertService.error(data.error);
      if (autoRecruitParams === '1') {
        await autoRecruit();
        return;
      }
      return;
    }

    // Delay for 1 second before navigating to the next recruitment link
    setTimeout(() => {
      window.location.href = `/recruit/${data.recruit_link}?auto_recruit=${autoRecruitParams}`;
    }, 1000);
  }, [autoRecruitParams]);

  useEffect(() => {
    if (!id) return;

    const checkRecruitmentHistory = async () => {
      const response = await fetch(`/api/recruit/${id}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        if (autoRecruitParams === '1') {
          await autoRecruit();
        }
      } else if (data.showCaptcha) {
        setShowCaptcha(true);
      }
    };

    checkRecruitmentHistory();
    const fetchUserInfo = async () => {
      const response = await fetch(
        `/api/general/getUserInfoByRecruitLink?recruit_link=${id}`,
      );
      const data = await response.json();

      if (!data.error) {
        setUserInfo(data);
      } else {
        // Handle error, maybe set an error state or alert
        logError('Error fetching user info:', data.error);
      }
    };

    fetchUserInfo();
  }, [autoRecruit, id, autoRecruitParams]);

  const handleCaptchaSuccess = async () => {
    // event.preventDefault();
    if (formRef.current === null) return;
    const formData = new FormData(formRef.current);
    const token = formData.get('cf-turnstile-response');

    const res = await fetch('/api/captcha/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const data = await res.json();
    if (data.success) {
      const response = await fetch('/api/recruit/handleRecruitment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recruitedUserId: id,
          selfRecruit: false,
        }),
      });

      const recData = await response.json();

      if (recData.success) {
        alertService.success(t('recruit.youAreBeingRecruited'), true);
        // Reload user data like the sidebar refresh button
        forceUpdate();
        if (autoRecruitParams === '1') {
          await autoRecruit();
          return;
        }
        // router.push(`/userprofile/${id}`);
        // Navigate to the user's profile page which is /userprofile/[id]
      }

      if (recData.error) {
        alertService.error(recData.error);
        if (autoRecruitParams === '1') {
          await autoRecruit();
        }
      }
    }
  };

  return (
    <MainArea title={t('recruit.title')}>
      {userInfo && (
        <div className="mb-5 items-center text-center">
          <p>
            <Text size="xl">
              {t('recruit.youAreBeingRecruited')}{' '}
              <span className="text-white">{userInfo.display_name}</span>
            </Text>
            <span className="text-white">{userInfo.display_name}</span>{' '}
            {t('recruit.level', { level: userInfo.level })}{' '}
            <span className="text-white">{userInfo.race}</span>{' '}
            {t('recruit.race', { race: userInfo.race, class: userInfo.class })}.
            <center>
              <Image
                src={getAssetPath(
                  'shields',
                  '150x150',
                  userInfo.race as PlayerRace,
                )}
                width="150"
                height="150"
                alt=""
              />
            </center>
            <Text size="md">{t('recruit.pleaseWaitCaptcha')}</Text>
          </p>
        </div>
      )}
      <div className="flex items-center justify-center">
        <div className="container mx-auto text-center">
          {error ? (
            <Text>{error}</Text>
          ) : (
            showCaptcha && (
              <form
                id="recruitForm"
                ref={formRef}
                onSubmit={handleCaptchaSuccess}
              >
                <div className="flex items-center justify-center">
                  <Turnstile
                    siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
                    onSuccess={handleCaptchaSuccess}
                  />
                </div>
              </form>
            )
          )}
          {!user && (
            <>
              <Space h="md" />
              <Text size="md">{t('recruit.dontHaveAccount')}</Text>
              <Button onClick={() => router.push(`/account/register`)}>
                {t('buttons.register')}
              </Button>
            </>
          )}
          <Space h="md" />
          <Divider />
          <Space h="md" />
          <GameCard title={t('recruit.antiSpamPolicyTitle')}>
            <Text size="sm">{t('recruit.antiSpamPolicy')}</Text>
            <Space h="md" />
            <Text size="sm">{t('recruit.captchaPolicy')}</Text>
          </GameCard>
        </div>
      </div>
    </MainArea>
  );
}
