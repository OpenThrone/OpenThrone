/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useState } from 'react';
import React from 'react';

import Form from '@/components/form';
import { useLayout } from '@/context/LayoutContext';

const Login = () => {
  const { setMeta } = useLayout();

  useEffect(() => {
    if (setMeta) {
      setMeta({
        title: 'OpenThrone - Login',
        description: 'Meta Description',
      });
    }
  }, [setMeta]);
  const [errorMessage, setErrorMessage] = useState<string>('');

  return (
    <>
      <div className="mainArea pb-10">
        <h2>Login</h2>
      </div>
      <div className="mx-auto w-3/4 py-2 md:col-span-9">
        <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
          {errorMessage && (
            <div className="mb-4 bg-red-500 p-4 text-white">{errorMessage}</div>
          )}
          <div className="flex justify-center">
            <div className="w-5/12">
              <Form type="login" setErrorMessage={setErrorMessage} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
