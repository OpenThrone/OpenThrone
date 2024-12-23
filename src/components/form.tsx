import { useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Paper,
  PasswordInput,
  TextInput,
  Text,
  Select,
  Button,
  Modal,
  Title,
  Center,
  Flex,
  Space,
} from '@mantine/core';
import toast from 'react-hot-toast';
import LoadingDots from '@/components/loading-dots';
import Link from 'next/link';
import { Turnstile } from '@marsidev/react-turnstile';

const Form = ({ type, setErrorMessage }: { type: string; setErrorMessage: (msg: string) => void }) => {
  const [loading, setLoading] = useState(false);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnsTileRef = useRef();

  const handleTurnstileSuccess = (token: string) => {
    setTurnstileToken(token);
  };

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
      shadow: 'md',
    },
  };

  const handleVacationOverride = async () => {
    try {
      const res = await fetch('/api/account/end-vacation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setShowVacationModal(false);
        toast.success('Vacation mode ended. Logging in...');
        // Retry login after ending vacation mode
        await handleLogin(formData.email, formData.password);
      } else {
        throw new Error('Failed to end vacation mode');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not end vacation mode');
    }
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      const res = await signIn('credentials', {
        redirect: false,
        email,
        password,
        turnstileToken,
      });

      if (res?.ok) {
        router.push('/home/overview');
      } else {
        const error = res?.error;
        try {
          const errorObj = JSON.parse(error); // Parse error if it contains JSON
          if (errorObj.message.includes('on vacation')) {
            setShowVacationModal(true);
            setUserId(errorObj.userID); // Set the `userID` for vacation override
          } else {
            setErrorMessage(errorObj.message || 'Something went wrong!');
          }
        } catch (parseError) {
          setErrorMessage(error || 'Something went wrong!');
        }
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Something went wrong!');
    } finally {
      turnsTileRef.current?.reset();
      setLoading(false);
    }
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
                await handleLogin(e.currentTarget.email.value, e.currentTarget.password.value, turnstileToken);
              } else {
                const res = await fetch('/api/auth/register/route', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ ...formData, turnstileToken }),
                });

                if (res.status === 200) {
                  toast.success('Account created! Redirecting to login...');
                  setTimeout(() => {
                    router.push('/account/login');
                  }, 2000);
                } else {
                  const message = await res.json();
                  setErrorMessage(message.error);
                }
              }
            } catch (error) {
              console.error(error);
              setErrorMessage('Something went wrong!');
            } finally {
              setLoading(false);
            }
          }}
        >
          <Flex direction="column" spacing="md" grow="true">
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
                  onChange={handleChange}
                />
                <PasswordInput
                  id="password"
                  name="password"
                  label="Password"
                  placeholder="Password"
                  required
                  size="md"
                  styles={inputStyles}
                  onChange={handleChange}
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
                  required
                  size="md"
                  styles={inputStyles}
                  onChange={handleChange}
                />
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
                  onChange={handleChange}
                />
                <PasswordInput
                  id="password"
                  name="password"
                  label="Password"
                  placeholder="Password"
                  required
                  size="md"
                  styles={inputStyles}
                  onChange={handleChange}
                />
                <Select
                  id="race"
                  name="race"
                  label="Race"
                  placeholder="Pick one"
                  value={formData.race}
                  onChange={(value) =>
                    setFormData((prevData) => ({ ...prevData, race: value || 'HUMAN' }))
                  }
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
                  onChange={(value) =>
                    setFormData((prevData) => ({ ...prevData, class: value || 'FIGHTER' }))
                  }
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
            <Button disabled={loading} type="submit" fullWidth size="md">
              {loading ? <LoadingDots color="#808080" /> : <Text>{type === 'login' ? 'Sign In' : 'Sign Up'}</Text>}
            </Button>
            <Space h="md" />
            {type === 'login' ? (
              <Text align="center" size="sm" c={'gray'}>
                Don&apos;t have an account?{' '}
                <Link href="/account/register">
                  <Text component="span" color="blue" inherit>
                    Sign up
                  </Text>
                </Link>{' '}
                for free.
              </Text>
            ) : (
              <Text align="center" size="sm" c={'gray'}>
                Already have an account?{' '}
                <Link href="/account/login">
                  <Text component="span" color="blue" inherit>
                    Sign in
                  </Text>
                </Link>{' '}
                instead.
              </Text>
            )}
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID || ''}
              onSuccess={handleTurnstileSuccess}
              ref={turnsTileRef}
            />
          </Flex>
        </form>

        <Modal
          opened={showVacationModal}
          onClose={() => setShowVacationModal(false)}
          title="Vacation Mode Active"
        >
          <Text>
            Your account is currently in vacation mode. Do you want to end vacation mode and log in?
          </Text>
          <Button onClick={handleVacationOverride} mt="md" fullWidth>
            End Vacation Mode
          </Button>
        </Modal>
      </Paper>
    </Center>
  );
};

export default Form;
