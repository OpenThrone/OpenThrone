/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useState } from 'react';
import React from 'react';

import Form from '@/components/form';
import { useLayout } from '@/context/LayoutContext';

const Login = () => {
  const { setMeta, meta } = useLayout();
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    if (setMeta && meta && meta.title !== "OpenThrone - Login") {
      setMeta({
        title: 'OpenThrone - Login',
        description: 'Meta Description',
      });
    }
  }, [meta, setMeta]);
  
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handlePasswordReset = async () => {
    // Logic to handle password reset
    // This will involve sending the reset email to `resetEmail`
  };

  return (
    <>
      <div className="mainArea pb-10">
        <h2>Login</h2>
      </div>
      <div className="mx-auto xs:w-96 md:w-3/4 py-2 md:col-span-9">
        <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
          {errorMessage && (
            <div className="mb-4 bg-red-500 p-4 text-white">{errorMessage}</div>
          )}
          <div className="flex justify-center">
            <div className="xs:w-96 md:w-5/12">
              <Form type="login" setErrorMessage={setErrorMessage} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
