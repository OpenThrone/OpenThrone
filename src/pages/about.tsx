import React from 'react';
import { Box, Text, Title, Container, SimpleGrid, ThemeIcon, Group, Button, List, Accordion } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faCode, faScroll, faQuestionCircle, faInfoCircle, faExclamationTriangle, faDragon } from '@fortawesome/free-solid-svg-icons';
import MainArea from '@/components/MainArea';
import Link from 'next/link';

const About = (props) => {
  const containerStyle = {
    background: 'linear-gradient(135deg, rgba(34,48,66,0.95) 0%, rgba(15,20,26,0.9) 55%, rgba(8,12,18,0.95) 100%)',
    border: '1px solid #2f3e52',
    borderRadius: '12px',
    padding: '32px',
    position: 'relative' as const,
    overflow: 'hidden',
    boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
  };

  return (
    <MainArea title="About OpenThrone">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 app-bg">
        
        {/* Header Section */}
        <Box className="public-rise" style={containerStyle}>
           <Box
            style={{
              position: 'absolute',
              top: '-120px',
              right: '-140px',
              width: '280px',
              height: '280px',
              background: 'radial-gradient(circle, rgba(229,197,90,0.15) 0%, rgba(229,197,90,0) 70%)',
              pointerEvents: 'none',
            }}
          />
          <Title order={1} style={{ fontFamily: 'MedievalSharp, serif', color: '#f4e7b3', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            About The Project
          </Title>
          <Text mt="md" size="lg" c="gray.3">
            OpenThrone is a community-driven effort to recreate and enhance the spirit of Darkthrone.
          </Text>
        </Box>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
          
          {/* Origin Story */}
          <Box className="public-rise public-rise-delay-1" style={containerStyle}>
            <Group mb="md">
              <ThemeIcon size="lg" variant="light" color="yellow">
                <FontAwesomeIcon icon={faScroll} />
              </ThemeIcon>
              <Title order={3} c="gray.1">The Origin</Title>
            </Group>
            <Text c="gray.4" lh={1.6}>
              OpenThrone is a community project hoping to recreate the TextBased MMORPG called <strong>DarkThrone</strong> which has gone dark after almost 20 years of service.
            </Text>
            <Text c="gray.4" mt="sm" lh={1.6}>
              While we are not affiliated with the original DarkThrone project, our community hopes to deliver a game that picks up where it left off, bringing forth many enhancements we were patiently waiting for.
            </Text>
            <Text c="gray.4" mt="sm" size="sm" fs="italic">
              OpenThrone started as a fork of the "Dark Curse" project by Moppler. We have since ported it to a modern tech stack (NextJS/React) to ensure longevity and easier contribution.
            </Text>
          </Box>

          {/* Current Status */}
          <Box className="public-rise public-rise-delay-2" style={containerStyle}>
            <Group mb="md">
              <ThemeIcon size="lg" variant="light" color="orange">
                <FontAwesomeIcon icon={faExclamationTriangle} />
              </ThemeIcon>
              <Title order={3} c="gray.1">Project Status</Title>
            </Group>
            <Text fw={700} c="yellow.4" tt="uppercase" mb="xs">Pre-Alpha / Live Development</Text>
            <Text c="gray.4" lh={1.6}>
              The game is currently in active development. The server you are playing on is a <strong>Live Development Server</strong>.
            </Text>
            <List mt="md" spacing="sm" size="sm" center icon={
              <ThemeIcon color="yellow" size={24} radius="xl">
                <FontAwesomeIcon icon={faInfoCircle} size="xs" />
              </ThemeIcon>
            }>
              <List.Item>
                <Text c="gray.4">The game may be reset often, sometimes without notice.</Text>
              </List.Item>
              <List.Item>
                <Text c="gray.4">Features are being added and balanced daily.</Text>
              </List.Item>
              <List.Item>
                <Text c="gray.4">We are focused on getting basic mechanics functioning perfectly.</Text>
              </List.Item>
            </List>
          </Box>

        </SimpleGrid>

        {/* FAQ & Community */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
            
             <Box className="public-rise public-rise-delay-3" style={containerStyle}>
                <Group mb="md">
                  <ThemeIcon size="lg" variant="light" color="blue">
                    <FontAwesomeIcon icon={faQuestionCircle} />
                  </ThemeIcon>
                  <Title order={3} c="gray.1">FAQ</Title>
                </Group>
                
                <Accordion variant="separated" radius="md" styles={{
                    item: { backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid #2f3e52' },
                    label: { color: '#e0e0e0' },
                    content: { color: '#adb5bd' }
                }}>
                  <Accordion.Item value="active">
                    <Accordion.Control>Is the game still being developed?</Accordion.Control>
                    <Accordion.Panel>Yes, a small group of volunteers have been working to get a working version of the game up and running. Please join the discord or submit PRs/Issues for discussion and enhancement.</Accordion.Panel>
                  </Accordion.Item>

                  <Accordion.Item value="help">
                    <Accordion.Control>What can I do to help?</Accordion.Control>
                    <Accordion.Panel>If you have experience with art, NextJS, or Figma, please reach out to the team via Discord.</Accordion.Panel>
                  </Accordion.Item>

                  <Accordion.Item value="ideas">
                    <Accordion.Control>Can I suggest ideas?</Accordion.Control>
                    <Accordion.Panel>Currently we are hyper-focused on getting the basic mechanics functioning. If you have ideas, please share them on our GitHub issues page so that we can centralize the discussion and come up with the best possible implementation. Unfortunately not all ideas will be implemented, but we encourage the ideas and appreciate any PR contributions.</Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
             </Box>

             <Box className="public-rise public-rise-delay-3" style={containerStyle}>
                <Group mb="md">
                  <ThemeIcon size="lg" variant="light" color="grape">
                    <FontAwesomeIcon icon={faUsers} />
                  </ThemeIcon>
                  <Title order={3} c="gray.1">Community</Title>
                </Group>
                <Text c="gray.4" lh={1.6}>
                    Contributions are the backbone of OpenThrone. Whether you are a developer, artist, or player, your feedback matters.
                </Text>

                <Group mt="xl" grow>
                    <Button 
                        component="a" 
                        href="https://discord.gg/j9NYxmBCjA" 
                        target="_blank"
                        rel="noopener noreferrer"
                        size="md" 
                        color="indigo"
                        leftSection={<FontAwesomeIcon icon={faUsers} />}
                    >
                        Join our Discord
                    </Button>
                     <Button 
                        component="a" 
                        href="https://github.com/OpenThrone/OpenThrone" 
                        target="_blank"
                        rel="noopener noreferrer"
                        size="md" 
                        variant="outline"
                        color="gray"
                        leftSection={<FontAwesomeIcon icon={faCode} />}
                    >
                        View on GitHub
                    </Button>
                </Group>
             </Box>

        </SimpleGrid>

        <Box mt="xl" style={{ textAlign: 'center' }}>
             <Text c="dimmed" size="xs">
                OpenThrone is licensed under the MIT License. Copyright © 2023.
             </Text>
        </Box>

      </div>
    </MainArea>
  );
};

export default About;
