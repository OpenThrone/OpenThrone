/* eslint-disable jsx-a11y/label-has-associated-control */
import { useState } from 'react';

import Form from '@/components/form';
import Layout from '@/components/Layout';
import { Meta } from '@/layouts/Meta';

const Login = () => {
  const [errorMessage, setErrorMessage] = useState<string>('');

  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
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
    </Layout>
  );
};

export default Login;
