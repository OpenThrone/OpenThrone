import { Turnstile } from '@marsidev/react-turnstile';
import router, { useRouter } from 'next/router';
import React, { useEffect, useState, useRef } from 'react';

import { alertService } from '@/services';
import autoRecruit from '../auto-recruit';
import Alert from '@/components/alert';

export default function Recruit() {
  const router = useRouter();
  const { id, auto_recruit } = router.query;
  const [error, setError] = useState(null);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const formRef = React.useRef<HTMLFormElement | null>(null);

  
  useEffect(() => {
    if (!id) {
      return;
    }
    const checkRecruitmentHistory = async () => {
      const response = await fetch(`/api/recruit/${id}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else if (data.showCaptcha) {
        setShowCaptcha(true);
      }
    };

    checkRecruitmentHistory();
  }, [id]);

  const autoRecruit = async () => {
    // Fetch the next recruitment link immediately
    const response = await fetch('/api/auto-recruit');
    const data = await response.json();
    console.log('data', data);
    if (data.error) {
      alertService.error(data.error);
      return;
    }

    // Delay for 5 seconds before navigating to the next recruitment link
    setTimeout(() => {
        console.log('push');
        window.location.href = `/recruit/${data.recruit_link}?auto_recruit=${auto_recruit}`;
      
    }, 5000);
  };
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
      const response = await fetch(`/api/recruit/${id}`, { method: 'POST' });
      const recData = await response.json();

      if (recData.success) {
        alertService.success("You've recruited into a player's army.", true);
        console.log(auto_recruit);
        if (auto_recruit === '1') {
          await autoRecruit();
          return;
        }
        router.push(`/userprofile/${id}`);
        // Navigate to the user's profile page which is /userprofile/[id]
      }
    }
  };

  return (
    <div className="mainArea pb-10">
      <h2>Recruiter</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
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
