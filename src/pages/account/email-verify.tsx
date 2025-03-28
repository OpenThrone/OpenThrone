import Alert from "@/components/alert";
import MainArea from "@/components/MainArea";
import { useUser } from "@/context/users";
import { alertService } from "@/services";
import { Button, Grid, Space, Text, TextInput, Modal } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import router from "next/router";
import { useState, useEffect } from "react";

const EmailVerify = (props) => {
  const searchParams = useSearchParams();
  const [input, setInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user } = useUser();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (searchParams.has('code')) {
      setInput(searchParams.get('code'));
    }
  }, [searchParams]);

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
      alertService.error("Verification failed: " + data.error);
    }
  };

  const handleEmailUpdate = async () => {
    if(!user) return;
    setOpened(false); // Close the modal after confirming
    // Send the request to update the email
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
      alertService.success("Email updated successfully", true);
      return router.push('/home/settings'); 
    } else {
      const data = await updateResponse.json();
      return alertService.error("Failed to update email: " + data.error);
    }
  };

  return (
    <MainArea
      title="Email Verify - Enter Verification Code">
      <form onSubmit={handleSubmit}>
        <Grid gutter="lg">
          <Grid.Col span={6}>
            <Text>Verification Code</Text>
            <TextInput
              id="code"
              placeholder="Enter Verification Code"
              required
              name="code"
              value={input}
              onChange={onChange}
            />
            <Space h='xs' />
            <Text>New Email</Text>
            <TextInput
              id="email"
              placeholder="Enter New Email"
              required
              name="email"
              value={email}
              onChange={onChange}
            />
            <Space h='xs' />
            <Text>Current Password</Text>
            <TextInput
              id="password"
              placeholder="Enter Current Password"
              required
              name="password"
              type="password"
              value={password}
              onChange={onChange}
            />
            <Space h='xs' />
            <Button
              type="submit"
              size="lg"
              fullWidth
            >
              Verify and Change Email
            </Button>
          </Grid.Col>
        </Grid>
      </form>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Confirm Email Change"
      >
        <Text>You&apos;re changing your email from {user?.email} to {email}. Are you sure?</Text>
        <Space h="md" />
        <Button onClick={handleEmailUpdate} fullWidth>
          Confirm
        </Button>
        <Space h="md" />
        <Button onClick={() => setOpened(false)} fullWidth color="red">
          Cancel
        </Button>
      </Modal>
    </MainArea>
  );
};

export default EmailVerify;
