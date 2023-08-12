import { useState } from 'react';

import Form from '@/components/form';
import Layout from '@/components/Layout';
import { Meta } from '@/layouts/Meta';

const Register = () => {
  const [errorMessage, setErrorMessage] = useState('');

  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
      <div className="container">
        <div className="row">
          <div className="mx-auto w-3/4 py-2 md:col-span-9">
            <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
              {errorMessage && (
                <div className="alert alert-danger">{errorMessage}</div>
              )}
              <div className="flex justify-center">
                <div className="w-5/12">
                  <Form type="register" setErrorMessage={setErrorMessage} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Register;
