import { TextInput, Button, Container, Title, Paper } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import router from 'next/router';
import { useState } from 'react';
import { showNotification } from '@mantine/notifications';
import classes from './floatinginput.module.css';
import MainArea from '@/components/MainArea';
import { logError } from '@/utils/logger';

import { getSafeLocale } from '@/utils/i18n';
import { InferGetServerSidePropsType } from "next";

const Index = (props: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('account');
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const floating = email.trim().length !== 0 || focused || undefined;

  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent the default form submit action
    try {
      const response = await fetch('/api/account/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }
      // Handle success
      showNotification({
        title: t('status.success'),
        message: t('register.registerSuccess'),
        color: 'green',
      });
      setTimeout(() => {
        router.push('/account/password-reset/result');
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

  return (
    <MainArea title={t('passwordReset.title')}>
      <Container size="sm" className="py-2 md:col-span-9">
        <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg" style={{ backgroundColor: '#b5a565'}}>
          <form onSubmit={handleSubmit}>
            <Title order={3}>{t('passwordReset.enterYourEmail')}</Title>
            <p className="text-gray-800">{t('passwordReset.sendLinkText')}</p>
            <TextInput
              label={t('passwordReset.email')}
              placeholder={t('passwordReset.email')}
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              classNames={classes}
              mt="md"
              autoComplete="nope"
              data-floating={floating}
              labelProps={{ 'data-floating': floating }}
              className="w-full rounded border border-gray-300"
            />
            <div className="flex justify-end mt-4">
              <Button
                type="submit"
                variant="filled"
                color="blue"
                className="inline-flex justify-center py-2 px-4 shadow-sm text-sm font-medium rounded-md text-white"
              >
                {t('buttons.submit')}
              </Button>
            </div>
          </form>
        </Paper>
      </Container>
    </MainArea>
  );
};

export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(getSafeLocale(context), ['account'])),
    },
  };
};

export default Index;
