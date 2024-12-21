import { useState } from 'react';

import Form from '@/components/form';
import Alert from '@/components/alert';
import MainArea from '@/components/MainArea';

const Register = (props) => {
  const [errorMessage, setErrorMessage] = useState('');

  return (
    <>
      <MainArea
        title="Register Now">
        <div className="mx-auto xs:w-96 md:w-3/4 py-2 md:col-span-9">
          <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
            {errorMessage && (
              <div className="alert alert-error">{errorMessage}</div>
            )}
            <div className="flex justify-center">
              <div className="xs:w-96 md:w-5/12">
                <Form type="register" setErrorMessage={setErrorMessage} />
              </div>
            </div>
          </div>
        </div>
      </MainArea>
    </>
  );
};

export default Register;
