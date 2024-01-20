// pages/auto-recruit.tsx
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { alertService } from '@/services';
import Alert from '@/components/alert';

export default function AutoRecruit() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleStart = async () => {
    setIsLoading(true);

    // Fetch the next recruitment link immediately
    const response = await fetch('/api/auto-recruit');
    const data = await response.json();

    if (data.error) {
      alertService.error(data.error);
      setIsLoading(false);
      return;
    }

    // Delay for 5 seconds before navigating to the next recruitment link
    setTimeout(() => {
      router.push(`/recruit/${data.recruit_link}?auto_recruit=1`);
    }, 5000);
  };

  return (
    <div className="mainArea pb-10">
      <h2>Auto-Recruiter</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <div className="flex h-screen items-center justify-center">
        <div className="container mx-auto text-center">
          <p>Click Start to begin the Auto-Recruit, a new link will appear.</p>
          <button
            className="mt-4 rounded bg-blue-500 px-4 py-2 text-white"
            onClick={handleStart}
            disabled={isLoading}
            type="button"
          >
            {isLoading ? 'Loading...' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
