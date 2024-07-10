import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { setTimeout } from 'timers';
import { Paper, PasswordInput, TextInput, Text, Select, Button, Space, Group, Title, Center, Flex } from '@mantine/core';
import LoadingDots from '@/components/loading-dots';

const Form = ({
  type,
  setErrorMessage,
}: {
  type: string;
  setErrorMessage: (msg: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    display_name: '',
    email: '',
    password: '',
    race: 'HUMAN',
    class: 'FIGHTER',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const inputStyles = {
    label: {
      color: 'darkgray', // Tailwind's gray-400 color
      fontWeight: 'bolder',
      shadow:'md'
    },
  };

  return (
    <Center>
      <Paper withBorder shadow="md" p={30} radius="md" style={{ width: '100%', maxWidth: 400 }}>
        <Title order={2} align="center" mb="md" c={'gray'}>
          {type === 'login' ? 'Sign In' : 'Sign Up'}
        </Title>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              if (type === 'login') {
                const res = await signIn('credentials', {
                  redirect: false,
                  email: e.currentTarget.email.value,
                  password: e.currentTarget.password.value,
                });
                if (res?.ok) {
                  setLoading(false);
                  router.push('/home/overview');
                } else {
                  setLoading(false);
                  setErrorMessage(res?.error ?? 'Something went wrong!');
                }
              } else {
                const res = await fetch('/api/auth/register/route', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(formData),
                });

                if (res.status === 200) {
                  toast.success('Account created! Redirecting to login...');
                  setTimeout(() => {
                    router.push('/account/login');
                  }, 2000);
                } else {
                  const message = await res.json();
                  setLoading(false);
                  setErrorMessage(message.error);
                }
              }
            } catch (error) {
              console.error(error);
              setErrorMessage('Something went wrong!');
              setLoading(false);
            }
          }}
        >
          <Flex direction="column" spacing="md" grow>
            {type === 'login' ? (
              <>
                <TextInput
                  id="email"
                  name="email"
                  type="email"
                  label="Email Address"
                  placeholder="username@email.com"
                  autoComplete="email"
                  required
                  size="md"
                  styles={inputStyles}
                />
                <PasswordInput
                  id="password"
                  name="password"
                  label="Password"
                  placeholder="Password"
                  required
                  size="md"

                  styles={inputStyles}
                />
              </>
            ) : (
                <>
                  
                <TextInput
                  id="display_name"
                  name="display_name"
                  label="User Name"
                  placeholder="DisplayName"
                  autoComplete="display_name"
                  onChange={handleChange}
                  required
                    size="md"
                    styles={inputStyles}
                />
                <TextInput
                  id="email"
                  name="email"
                  type="email"
                  label="Email Address"
                  placeholder="username@email.com"
                  autoComplete="email"
                  onChange={handleChange}
                  required
                    size="md"

                    styles={inputStyles}
                />
                <PasswordInput
                  id="password"
                  name="password"
                  label="Password"
                  placeholder="Password"
                  onChange={handleChange}
                  required
                    size="md"
                    styles={inputStyles}
                />
                <Select
                  id="race"
                  name="race"
                  label="Race"
                  placeholder="Pick one"
                  value={formData.race}
                  onChange={(value) => setFormData((prevData) => ({ ...prevData, race: value }))}
                  data={[
                    { value: 'HUMAN', label: 'HUMAN' },
                    { value: 'UNDEAD', label: 'UNDEAD' },
                    { value: 'GOBLIN', label: 'GOBLIN' },
                    { value: 'ELF', label: 'ELF' },
                  ]}
                    size="md"
                    styles={inputStyles}
                />
                <Select
                  id="class"
                  name="class"
                  label="Class"
                  placeholder="Pick one"
                  value={formData.class}
                  onChange={(value) => setFormData((prevData) => ({ ...prevData, class: value }))}
                  data={[
                    { value: 'FIGHTER', label: 'FIGHTER' },
                    { value: 'CLERIC', label: 'CLERIC' },
                    { value: 'ASSASSIN', label: 'ASSASSIN' },
                    { value: 'THIEF', label: 'THIEF' },
                  ]}
                    size="md"
                    styles={inputStyles}
                />
              </>
            )}
            <Space h="md" />
            <Button
              disabled={loading}
              type="submit"
              fullWidth
              size="md"
            >
              {loading ? <LoadingDots color="#808080" /> : <Text>{type === 'login' ? 'Sign In' : 'Sign Up'}</Text>}
            </Button>
            <Space h="md" />
            {type === 'login' ? (
              <Paper withBorder shadow="md" p={15} radius="xs">
                <Text align="center" size="sm" c={'gray'}>
                  Don&apos;t have an account?{' '}
                  <Link href="/account/register">
                    <Text component="span" color="blue" inherit>
                      Sign up
                    </Text>
                  </Link>{' '}
                  for free.
                </Text>
                <Text align="center" size="sm" c={'gray'}>
                  Forgot your password?{' '}
                  <Link href="/account/password-reset">
                    <Text component="span" color="blue" inherit>
                      Reset it
                    </Text>
                  </Link>{' '}
                  now.
                </Text>
              </Paper>
            ) : (
              <Paper withBorder shadow="md" p={15} radius="xs">
                  <Text align="center" size="sm" c={'gray'}>
                  Already have an account?{' '}
                  <Link href="/account/login">
                    <Text component="span" color="blue" inherit>
                      Sign in
                    </Text>
                  </Link>{' '}
                  instead.
                </Text>
              </Paper>
            )}
          </Flex>
        </form>
      </Paper>
    </Center>
  );
};

export default Form;
