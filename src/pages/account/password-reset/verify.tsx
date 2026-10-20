import { Alert, Button, Group, PasswordInput, TextInput } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { FormEvent } from 'react';
import { useState } from 'react';

import MainArea from '@/components/MainArea';
import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { logError } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

const Index = () => {
  const { t } = useTranslation('account');
  const router = useRouter();
  const [verify, setVerify] = useState('');
  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const response = await fetch(
        verified ? '/api/account/passChange' : '/api/account/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            verified ? { newPassword, verify, email } : { verify, email },
          ),
        },
      );
      const data = await response.json();
      if (
        !response.ok ||
        data?.status === false ||
        (!verified && data?.verified !== true)
      )
        throw new Error('Password verification or reset failed');
      if (verified) await router.push('/account/login');
      else setVerified(true);
    } catch (error) {
      logError('Password recovery failed', error);
      setErrorMessage(t('passwordReset.resetFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <>
      <SeoHead
        title={t('passwordReset.title')}
        description={t('passwordReset.description')}
      />
      <MainArea title={t('passwordReset.title')}>
        <PublicAuthLayout
          title={t('passwordReset.title')}
          description={t('passwordReset.description')}
          formTitle={t(
            verified
              ? 'passwordReset.setNewPasswordTitle'
              : 'passwordReset.verificationCode',
          )}
        >
          {errorMessage && (
            <Alert color="red" role="alert" mb="md">
              {errorMessage}
            </Alert>
          )}
          <form onSubmit={handleSubmit}>
            {verified ? (
              <PasswordInput
                label={t('passwordReset.newPassword')}
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.currentTarget.value)}
              />
            ) : (
              <>
                <TextInput
                  label={t('passwordReset.email')}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
                <TextInput
                  label={t('passwordReset.verificationCode')}
                  required
                  autoComplete="one-time-code"
                  value={verify}
                  onChange={(event) => setVerify(event.currentTarget.value)}
                  mt="md"
                />
              </>
            )}
            <Group className={classes.actions}>
              <Button
                component={Link}
                href="/account/password-reset"
                variant="outline"
              >
                {t('passwordReset.requestNewCode')}
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {t(
                  verified
                    ? 'passwordReset.setNewPassword'
                    : 'passwordReset.verify',
                )}
              </Button>
              <Button component={Link} href="/account/login" variant="outline">
                {t('login.title')}
              </Button>
            </Group>
          </form>
        </PublicAuthLayout>
      </MainArea>
    </>
  );
};
export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'account',
    ])),
  },
});
export default Index;
