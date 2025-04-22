/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useState } from 'react';
import React from 'react';

import Form from '@/components/form';
import { useLayout } from '@/context/LayoutContext';
import MainArea from '@/components/MainArea';
import { Alert, Space } from '@mantine/core';
import VacationModeModal from '@/components/VacationModeModal';

const Login = (props) => {
  const { setMeta, meta } = useLayout();
  const [resetEmail, setResetEmail] = useState('');
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacationUserId, setVacationUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

  useEffect(() => {
    if (setMeta && meta && meta.title !== "OpenThrone - Login") {
      setMeta({
        title: 'OpenThrone - Login',
        description: 'Meta Description',
      });
    }
  }, [meta, setMeta]);

  useEffect(() => {
    if (!searchParams) return;
    if (searchParams.get('vacation') === '1') {
      setShowVacationModal(true);
      // Optionally set userId if you want to pass it to the modal
    } else if (searchParams.get('error') === 'account_status') {
      setErrorMessage('Your account is currently restricted. Please contact support if you believe this is a mistake.');
    }
  }, [searchParams]);

  return (
    <>
      <MainArea
        title="Login">
        <div className="mx-auto xs:w-96 md:w-3/4 py-2 md:col-span-9">
          <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
            {errorMessage && (
              <div className="mb-4 bg-red-500 p-4 text-white">{errorMessage}</div>
            )}
            <div className="flex justify-center">
              <div className="xs:w-96 md:w-5/12">
                {(process.env.NEXT_PUBLIC_DISABLE_LOGIN === 'true') && (
                  <>
                    <Alert variant='filled' color='red' title='Login is disabled'>Please check Discord or our News for updates.
                    </Alert>
                    <Space h="md" />
                  </>
                )
              }
                <Form type="login" setErrorMessage={setErrorMessage} />
              </div>
            </div>
          </div>
        </div>
        <VacationModeModal
          opened={showVacationModal}
          onClose={() => setShowVacationModal(false)}
          userId={vacationUserId}
          onVacationEnd={() => setShowVacationModal(false)}
        />
      </MainArea>
    </>
  );
};

export default Login;
