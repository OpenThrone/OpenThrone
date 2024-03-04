import { Turnstile } from '@marsidev/react-turnstile';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import { alertService } from '@/services';

interface RecruitProps {
  id: string;
  display_name: string;
  level: number;
  class: string;
  race: string;
}

export default function Recruit() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(null);
  const autoRecruitParams = params?.get('auto_recruit');
  const id = usePathname()?.split('/').pop();
  const [showCaptcha, setShowCaptcha] = useState(false);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [userInfo, setUserInfo] = useState<RecruitProps | null>(null);

  const autoRecruit = async () => {
    // Fetch the next recruitment link immediately
    const response = await fetch('/api/auto-recruit');
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
  };

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
        `/api/getUserInfoByRecruitLink?recruit_link=${id}`,
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
  }, [params]);

  const handleCaptchaSuccess = async () => {
    // event.preventDefault();
    if (formRef.current === null) return;
    const formData = new FormData(formRef.current);
    const token = formData.get('cf-turnstile-response');

    const res = await fetch('/api/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const data = await res.json();
    if (data.success) {
      // Set the self_recruit parameter if auto_recruit is active
      const body =
        autoRecruitParams === '1' ? { self_recruit: '1' } : undefined;

      const response = await fetch(`/api/recruit/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const recData = await response.json();

      if (recData.success) {
        alertService.success("You've recruited into a player's army.", true);
        console.log('params', params);
        if (autoRecruitParams === '1') {
          await autoRecruit();
          return;
        }
        router.push(`/userprofile/${id}`);
        // Navigate to the user's profile page which is /userprofile/[id]
      }
      console.log('recData: ', recData);
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
      <h2>Recruiter</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      {userInfo && (
        <div className="mb-5 text-center">
          <p>
            {userInfo.display_name} is a level {userInfo.level} {userInfo.race}{' '}
            {userInfo.class}.
          </p>
        </div>
      )}
      <div className="flex h-screen items-center justify-center">
        <div className="container mx-auto text-center">
          {error ? (
            <p>{error}</p>
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
        </div>
      </div>
    </div>
  );
}
