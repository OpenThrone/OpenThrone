import router from 'next/router';
import { useState } from 'react';
import { showNotification } from '@mantine/notifications';
import { alertService } from '@/services';
import { Space, TextInput, Button, Container, Title, Paper } from '@mantine/core';
import classes from './floatinginput.module.css';
import MainArea from '@/components/MainArea';

const Index = (props) => {
  const [verify, setVerify] = useState('');
  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [verifyFocused, setVerifyFocused] = useState(false);
  const emailFloating = email.trim().length !== 0 || emailFocused || undefined;
  const verifyFloating = verify.trim().length !== 0 || verifyFocused || undefined;

  const handleVerifySubmit = async (e) => {
    e.preventDefault(); // Prevent the default form submit action
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
        title: 'Success',
        message: 'Verification successful!',
        color: 'green',
      });
      setVerified(true); // Update the verified status to show the new password form
    } catch (error) {
      console.error('Error:', error);
      showNotification({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault(); // Prevent the default form submit action for password reset
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
      alertService.success('Password updated! Login with it now');
      setTimeout(() => {
        router.push('/account/login');
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      showNotification({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    }
  };

  if (!verified) {
    // Verification form
    return (
      <MainArea title="Password Reset">
        <Container size='lg' className="py-2 md:col-span-9">
          <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg" style={{ backgroundColor: '#b5a565' }}>
            <form onSubmit={handleVerifySubmit}>
              <TextInput
                label="Email Address"
                placeholder="Enter your email address"
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
                label="Verification code"
                placeholder="Enter your verification code"
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
              <div className="flex justify-end mt-4">
                <Button
                  type="submit"
                  variant="filled"
                  color="blue"
                  className="inline-flex justify-center py-2 px-4 shadow-sm text-sm font-medium rounded-md text-white"
                >
                  Verify
                </Button>
              </div>
            </form>
          </Paper>
        </Container>
      </MainArea>
    );
  } else {
    return (
      <MainArea title="Set New Password">
        <Container size="xs" className="py-2 md:col-span-9">
          <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg" style={{ backgroundColor: '#b5a565' }}>
            <form onSubmit={handlePasswordReset}>
              <TextInput
                label="New Password"
                placeholder="Enter your new password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
              <div className="flex justify-end mt-4">
                <Button
                  type="submit"
                  variant="filled"
                  color="blue"
                  className="inline-flex justify-center py-2 px-4 shadow-sm text-sm font-medium rounded-md text-white"
                >
                  Set New Password
                </Button>
              </div>
            </form>
          </Paper>
        </Container>
      </MainArea>
    );
  }
};

export default Index;
