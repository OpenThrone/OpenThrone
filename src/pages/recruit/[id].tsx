import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function Recruit() {
  const router = useRouter();
  const { id } = router.query;
  const [error, setError] = useState(null);
  const [showCaptcha, setShowCaptcha] = useState(false);

  useEffect(() => {
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
    const response = await fetch(`/api/recruit/${id}`, { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      // Handle success logic here, e.g., navigate to another page or show a success message
    }
  };

  return (
    <div>
      {error ? (
        <p>{error}</p>
      ) : showCaptcha ? (
        // Render the Cloudflare turnstile widget here
        // On success, call handleCaptchaSuccess
        <div>Captcha goes here</div>
      ) : null}
    </div>
  );
}
