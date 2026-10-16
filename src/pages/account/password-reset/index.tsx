import { Alert, Button, Group, Text, TextInput } from '@mantine/core';
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
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/account/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error('Password reset request failed');
      await router.push('/account/password-reset/result');
    } catch (error) {
      logError('Password reset request failed', error);
      setErrorMessage(t('passwordReset.resetLinkFailed'));
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
          formTitle={t('passwordReset.enterYourEmail')}
        >
          <Text className={classes.prose} mb="lg">
            {t('passwordReset.sendLinkText')}
          </Text>
          {errorMessage && (
            <Alert color="red" role="alert" mb="md">
              {errorMessage}
            </Alert>
          )}
          <form onSubmit={handleSubmit}>
            <TextInput
              label={t('passwordReset.email')}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <Group className={classes.actions}>
              <Button type="submit" loading={isSubmitting}>
                {t('passwordReset.sendResetLink')}
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
