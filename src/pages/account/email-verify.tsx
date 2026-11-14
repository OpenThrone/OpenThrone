import { Button, Grid, Modal, Space, Text, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { signOut, useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';

const EmailVerify = () => {
  const { t } = useTranslation('account');
  const router = useRouter();
  const [input, setInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user } = useUser();
  // The client user object carries no email; the session does (as on Settings).
  const { data: sessionData } = useSession();
  const currentEmail = (sessionData?.user?.email as string) ?? '';
  const [opened, setOpened] = useState(false);

  // The emailed link carries the token in the URL fragment (never sent to
  // the server); links sent before that used ?token= (and older ones
  // ?code=). Fill the code field from whichever is present, then clear it
  // from the address bar and history.
  useEffect(() => {
    if (!router.isReady) return;
    const first = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    const linkToken =
      fromHash || first(router.query.token) || first(router.query.code);
    if (!linkToken) return;
    setInput(linkToken);
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname,
    );
  }, [router.isReady, router.query.token, router.query.code]);

  const onChange = (event) => {
    const { name, value } = event.currentTarget;
    if (name === 'code') setInput(value);
    if (name === 'password') setPassword(value);
    if (name === 'email') setEmail(value);
  };

  // The code, password and new address are all checked by
  // /api/account/update-email when the change is confirmed. (This used to
  // pre-check the code with /api/account/verify, which only accepts
  // password-reset codes, so every email-change code was refused there.)
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!user) return;
    setOpened(true);
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
      // Sessions are tied to the address they signed in with, so the old
      // session ends here: sign out cleanly and send the player to sign in
      // with the new address instead of bouncing them there on 401s.
      alertService.success(t('emailVerify.emailUpdatedSignIn'), true);
      await signOut({ redirect: false });
      return router.push('/account/login');
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
            oldEmail: currentEmail,
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
