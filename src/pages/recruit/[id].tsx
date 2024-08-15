import { Turnstile } from '@marsidev/react-turnstile';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Divider, Group, Paper, Space, Text } from '@mantine/core';
import Alert from '@/components/alert';
import { alertService } from '@/services';
import Image from 'next/image';
import { useUser } from '@/context/users';
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
  const params = useSearchParams();
  const [error, setError] = useState(null);
  const autoRecruitParams = params?.get('auto_recruit');
  const id = usePathname()?.split('/').pop();
  const [showCaptcha, setShowCaptcha] = useState(false);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [userInfo, setUserInfo] = useState<RecruitProps | null>(null);
  const { user } = useUser();

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
        console.error('Error fetching user info:', data.error);
      }
    };

    fetchUserInfo();
  }, [params, autoRecruit, id, autoRecruitParams]);

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
        alertService.success("You've been recruited into a player's army.", true);
        if (autoRecruitParams === '1') {
          await autoRecruit();
          return;
        }
        //router.push(`/userprofile/${id}`);
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
    <div className="mainArea pb-10">
      <h2 className="page-title">Recruiter</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      {userInfo && (
        <div className="mb-5 text-center items-center">
          <p>
            <Text size='xl'>You are being recruited into the army of <span className="text-white">{userInfo.display_name}</span></Text>
            <span className="text-white">{userInfo.display_name}</span> is a level {userInfo.level} {userInfo.race}{' '}
            {userInfo.class}.
            <center>
              <Image src={getAssetPath('shields', '150x150', userInfo.race)} width={'150'} height={'150'} alt="" />
            </center>
            <Text size="md">Please wait for Cloudflare&lsquo;s captcha below.</Text>

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
            <Text size="md">
              Don&lsquo;t have an account? Sign up now to join the fun!
            </Text>
              <Button onClick={() => router.push(`/account/register`)}>
              SignUp
              </Button> 
            </>
          )}
          <Space h="md" />
          <Divider />
          <Space h="md" />
          <Paper pl={'md'} pr={'md'} pb={'sm'}>
            <Text size="xl">Anti Spam Policy</Text>
            <Text size="sm">
            Recruiting is intended to be used with your friends and family. Spam of any kind is not permitted and will result in suspension or ban of your account. Further violations may result in a ban of your IP address. Please be respectful of others and only recruit with permission.
            </Text>
            <Space h="md" />
            <Text size="sm">
              We use Cloudflare&lsquo;s Turnstile to prevent spam and abuse. By
              completing this captcha, you are helping us keep the game fair and
              fun for everyone.
            </Text>
          </Paper>
        </div>
      </div>
    </div>
  );
}
