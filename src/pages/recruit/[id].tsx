import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

import { alertService } from '@/services';

export default function Recruit() {
  const router = useRouter();
  const { id } = router.query;
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
        router.push(`/userprofile/${id}`);
        // Navigate to the user's profile page which is /userprofile/[id]
      }
    }
  };

  return (
    <div className="mainArea pb-10">
      <h2>Recruiter</h2>
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
