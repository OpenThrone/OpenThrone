import { TextInput, Button, Container, Title, Paper } from '@mantine/core';
import router from 'next/router';
import { useState } from 'react';
import { showNotification } from '@mantine/notifications';
import classes from './floatinginput.module.css';

const Index = (props) => {
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
        title: 'Success',
        message: 'Account created! Redirecting to login...',
        color: 'green',
      });
      setTimeout(() => {
        router.push('/account/password-reset/result');
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

  return (
    <Container>
      <Title order={2} className="mainArea pb-10">Password Reset</Title>
      <Container size="sm" className="py-2 md:col-span-9">
        <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg" style={{ backgroundColor: '#b5a565'}}>
          <form onSubmit={handleSubmit}>
            <Title order={3}>Enter your Email</Title>
            <p className="text-gray-800">We will send you a link to reset your password</p>
            <TextInput
              label="Email Address"
              placeholder="Enter your email address"
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
                Submit
              </Button>
            </div>
          </form>
        </Paper>
      </Container>
    </Container>
  );
};

export default Index;
