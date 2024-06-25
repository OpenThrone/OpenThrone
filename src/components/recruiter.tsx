import React, { useEffect, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import Image from 'next/image';

const Recruiter = ({ user, showCaptcha, onSuccess }) => {
  const [error, setError] = useState(null);
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
    <div>
      <div className="mb-5 text-center justify-center items-center content-center">
        
          {user.display_name} is a level {user.level} {user.race}{' '}
          {user.class}.
        <center><Image src={`${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/shields/${user.race}_150x150.webp`} width={'150'} height={'150'} alt="" /></center>
        
      </div>
      <div className="flex items-center justify-center">
        <div className="container mx-auto text-center">
          {error ? (
            <p>{error}</p>
          ) : (
            showCaptcha && (
                <div className="flex items-center justify-center">
                <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
                onSuccess={onSuccess}
                  />
                  </div>
            )
          )}
        </div>
      </div>
      
    </div>
  );
};

export default Recruiter;
