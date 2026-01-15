import { Button, Grid, Modal, Space, Text, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';

const EmailVerify = (props) => {
  const { t } = useTranslation('account');
  const router = useRouter();
  const [input, setInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user } = useUser();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const codeParam = Array.isArray(router.query.code)
      ? router.query.code[0]
      : router.query.code;
    if (codeParam) {
      setInput(codeParam);
    }
  }, [router.query.code]);

  const onChange = (event) => {
    const { name, value } = event.currentTarget;
    if (name === 'code') setInput(value);
    if (name === 'password') setPassword(value);
    if (name === 'email') setEmail(value);
  };

  const handleSubmit = async (event) => {
    if (!user) return;
    event.preventDefault();

    const response = await fetch('/api/account/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        verify: input,
        password,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      // Open confirmation modal
      setOpened(true);
    } else {
      alertService.error(
        `${t('emailVerify.verificationFailedError')} ${data.error}`,
      );
    }
  };

  const handleEmailUpdate = async () => {
    if (!user) return;
    setOpened(false); // Close the modal after confirming
    // Send request to update the email
    const updateResponse = await fetch('/api/account/update-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        newEmail: email,
        password,
        verify: input,
      }),
    });

    if (updateResponse.ok) {
      alertService.success(t('emailVerify.emailUpdatedSuccessfully'), true);
      return router.push('/home/settings');
    }
    const data = await updateResponse.json();
    return alertService.error(
      `${t('emailVerify.failedToUpdateEmail')}: ${data.error}`,
    );
  };

  return (
    <MainArea title={t('emailVerify.pageTitle')}>
      <form onSubmit={handleSubmit}>
        <Grid gutter="lg">
          <Grid.Col span={6}>
            <Text>{t('emailVerify.verificationCode')}</Text>
            <TextInput
              id="code"
              placeholder={t('emailVerify.enterVerificationCode')}
              required
              name="code"
              value={input}
              onChange={onChange}
            />
            <Space h="xs" />
            <Text>{t('emailVerify.newEmail')}</Text>
            <TextInput
              id="email"
              placeholder={t('emailVerify.enterNewEmail')}
              required
              name="email"
              value={email}
              onChange={onChange}
            />
            <Space h="xs" />
            <Text>{t('emailVerify.currentPassword')}</Text>
            <TextInput
              id="password"
              placeholder={t('emailVerify.enterCurrentPassword')}
              required
              name="password"
              type="password"
              value={password}
              onChange={onChange}
            />
            <Space h="xs" />
            <Button type="submit" size="lg" fullWidth>
              {t('emailVerify.verifyAndChangeEmail')}
            </Button>
          </Grid.Col>
        </Grid>
      </form>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={t('emailVerify.confirmEmailChange')}
      >
        <Text>
          {t('emailVerify.changingEmailConfirm', {
            oldEmail: user?.email,
            newEmail: email,
          })}
        </Text>
        <Space h="md" />
        <Button onClick={handleEmailUpdate} fullWidth>
          {t('emailVerify.confirm')}
        </Button>
        <Space h="md" />
        <Button onClick={() => setOpened(false)} fullWidth color="red">
          {t('emailVerify.cancel')}
        </Button>
      </Modal>
    </MainArea>
  );
};

export default EmailVerify;
