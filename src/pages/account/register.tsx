import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Alert, Box, Button, Group, SimpleGrid, Space, Text } from '@mantine/core';
import { faShieldHalved, faUserPlus } from '@fortawesome/free-solid-svg-icons';

import Form from '@/components/form';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { useLayout } from '@/context/LayoutContext';

const Register = (props) => {
  const { setMeta, meta } = useLayout();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (setMeta && meta && meta.title !== 'OpenThrone - Register') {
      setMeta({
        title: 'OpenThrone - Register',
        description: 'Meta Description',
      });
    }
  }, [meta, setMeta]);

  return (
    <MainArea title="Register Now">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <div className="public-rise">
            <GameCard title="Forge a New Legacy" icon={faUserPlus} goldAccent={false}>
              <Text size="sm" c="gray.3" lh={1.7}>
                Claim a race, choose your class, and rise from a fledgling outpost to a legend whispered across the realm.
              </Text>
              <Box mt="md">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.3em' }}>
                  Starter Advantages
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" mt="sm">
                  {[
                    { label: 'Protected Turns', value: '0h' },
                    { label: 'Gold', value: '25,000' },
                  ].map((item) => (
                    <Box
                      key={item.label}
                      p="sm"
                      style={{
                        backgroundColor: '#0f141a',
                        borderRadius: '6px',
                        border: '1px solid #1f2b3b',
                        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                      }}
                    >
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.3em' }}>
                        {item.label}
                      </Text>
                      <Text size="sm" fw={700} c="gray.2" mt={4}>
                        {item.value}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>
              </Box>
              <Group mt="md">
                <Button component={Link} href="/community/news" size="sm" variant="outline" color="gray">
                  Latest News
                </Button>
                <Button component={Link} href="/account/login" size="sm" color="yellow">
                  Already Enlisted?
                </Button>
              </Group>
            </GameCard>
          </div>

          <div className="public-rise public-rise-delay-1">
            <GameCard title="Create Your Commander" icon={faShieldHalved}>
              {errorMessage && (
                <>
                  <Alert variant="filled" color="red" title="Registration Failed">
                    {errorMessage}
                  </Alert>
                  <Space h="md" />
                </>
              )}
              {(process.env.NEXT_PUBLIC_DISABLE_REGISTRATION === 'true') && (
                <>
                  <Alert variant="filled" color="red" title="Registration is disabled">
                    Please check Discord or our News for updates.
                  </Alert>
                  <Space h="md" />
                </>
              )}
              <Form type="register" setErrorMessage={setErrorMessage} layout="bare" />
            </GameCard>
          </div>
        </SimpleGrid>
      </div>
    </MainArea>
  );
};

export default Register;
