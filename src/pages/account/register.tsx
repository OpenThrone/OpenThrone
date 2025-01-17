import { useState } from 'react';

import Form from '@/components/form';
import MainArea from '@/components/MainArea';
import { Alert, Space } from '@mantine/core';

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
                {(process.env.NEXT_PUBLIC_DISABLE_REGISTRATION === 'true') && (
                  <>
                    <Alert variant='filled' color='red' title='Registration is disabled'>Please check Discord or our News for updates.
                    </Alert>
                    <Space h="md" />
                  </>
                )
                }
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
