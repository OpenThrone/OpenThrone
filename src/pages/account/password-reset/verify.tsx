import { Button, Container, Paper, Space, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import router from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import MainArea from '@/components/MainArea';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

import classes from './floatinginput.module.css';

const Index = (props) => {
  const { t } = useTranslation('account');
  const [verify, setVerify] = useState('');
  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [verifyFocused, setVerifyFocused] = useState(false);
  const emailFloating = email.trim().length !== 0 || emailFocused || undefined;
  const verifyFloating =
    verify.trim().length !== 0 || verifyFocused || undefined;

  const handleVerifySubmit = async (e) => {
    e.preventDefault(); // Prevent's default form submit action
    try {
      const response = await fetch('/api/account/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verify, email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Handle successful verification
      showNotification({
        title: t('status.success'),
        message: t('passwordReset.verificationSuccessful'),
        color: 'green',
      });
      setVerified(true); // Update's verified status to show the new password form
    } catch (error) {
      logError('Error:', error);
      showNotification({
        title: t('status.error'),
        message: error.message,
        color: 'red',
      });
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault(); // Prevent's default form submit action for password reset
    try {
      const response = await fetch('/api/account/passChange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword, verify, email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Handle successful password reset
      alertService.success(t('passwordReset.passwordUpdated'));
      setTimeout(() => {
        router.push('/account/login');
      }, 2000);
    } catch (error) {
      logError('Error:', error);
      showNotification({
        title: t('status.error'),
        message: error.message,
        color: 'red',
      });
    }
  };

  if (!verified) {
    // Verification form
    return (
      <MainArea title={t('passwordReset.title')}>
        <Container size="lg" className="py-2 md:col-span-9">
          <Paper
            withBorder
            shadow="md"
            p="lg"
            className="advisor my-3 rounded-lg"
            style={{ backgroundColor: '#b5a565' }}
          >
            <form onSubmit={handleVerifySubmit}>
              <TextInput
                label={t('passwordReset.email')}
                placeholder={t('passwordReset.email')}
                required
                value={email}
                id="email"
                name="email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                classNames={classes}
                mt="md"
                autoComplete="nope"
                data-floating={emailFloating}
                labelProps={{ 'data-floating': emailFloating }}
                className="w-full rounded border border-gray-300"
              />
              <Space h="md" />
              <TextInput
                label={t('passwordReset.verificationCode')}
                placeholder={t('passwordReset.enterVerificationCode')}
                required
                value={verify}
                onChange={(event) => setVerify(event.currentTarget.value)}
                onFocus={() => setVerifyFocused(true)}
                onBlur={() => setVerifyFocused(false)}
                classNames={classes}
                mt="md"
                id="verify"
                name="verify"
                autoComplete="nope"
                data-floating={verifyFloating}
                labelProps={{ 'data-floating': verifyFloating }}
                className="w-full rounded border border-gray-300"
              />
              <div className="mt-4 flex justify-end">
                <Button
                  type="submit"
                  variant="filled"
                  color="blue"
                  className="inline-flex justify-center rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm"
                >
                  {t('passwordReset.verify')}
                </Button>
              </div>
            </form>
          </Paper>
        </Container>
      </MainArea>
    );
  }
  return (
    <MainArea title={t('passwordReset.setNewPasswordTitle')}>
      <Container size="xs" className="py-2 md:col-span-9">
        <Paper
          withBorder
          shadow="md"
          p="lg"
          className="advisor my-3 rounded-lg"
          style={{ backgroundColor: '#b5a565' }}
        >
          <form onSubmit={handlePasswordReset}>
            <TextInput
              label={t('passwordReset.newPassword')}
              placeholder={t('passwordReset.enterNewPassword')}
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
            <div className="mt-4 flex justify-end">
              <Button
                type="submit"
                variant="filled"
                color="blue"
                className="inline-flex justify-center rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm"
              >
                {t('passwordReset.setNewPassword')}
              </Button>
            </div>
          </form>
        </Paper>
      </Container>
    </MainArea>
  );
};

export default Index;
