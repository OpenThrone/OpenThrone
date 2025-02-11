import React, { forwardRef, useState } from 'react';
import { Space, Group, SimpleGrid, Container, Menu, UnstyledButton, Title } from '@mantine/core';
import Alert from './alert';
import { alertService } from '../services/alert.service';
import { faArrowRightFromBracket, faComments, faGear, faIdCard, faSkullCrossbones } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useLayout } from '@/context/LayoutContext';

interface MainAreaProps {
  title: string;
  children: React.ReactNode;
  paperWidth?: { sm: string; md: string };
}

const MainArea = forwardRef<HTMLDivElement, MainAreaProps>(
  function MainArea({ title, children, paperWidth }, ref) {
    const { authorized } = useLayout();
    const [userMenuOpened, setUserMenuOpened] = useState(false);
    return (
      <div className="mainArea pb-10 w-full" ref={ref || null}>
        <header
          style={
            {
              height: '56px',
              borderBottom: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))'
            }
          }>
          <Container
            size="lg"
            style={
              {
                height: '56px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }
            }
          >
            <Title order={2} className="text-gradient-orange bg-orange-gradient text-shadow text-shadow-xs">
              {title}
            </Title>
            {authorized && (
              <Group gap={'lg'} visibleFrom='md'>
                
<FontAwesomeIcon
                  icon={faComments}
                  visibility={(process.env.NEXT_PUBLIC_ENABLE_MESSAGING === 'false' ? 'hidden' : '')}
                    color='orange'
                  />
                <Menu
                  width={260}
                  position="bottom-end"
                  transitionProps={{ transition: 'pop-top-right' }}
                  onClose={() => setUserMenuOpened(false)}
                  onOpen={() => setUserMenuOpened(true)}
                  withinPortal
                >
                  <Menu.Target>
                    <i className="ra ra-double-team ra-fw text-gradient-orange bg-orange-gradient text-shadow text-shadow-xs" style={{ cursor: 'pointer' }} />
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Label>Social</Menu.Label>
                    <Link href="/social/friends" passHref>
                      <Menu.Item leftSection={<FontAwesomeIcon icon={faIdCard} size={'sm'} stroke={'1.5'} />}>
                        Friends
                      </Menu.Item>
                      </Link>
                      <Link href="/social/enemies" passHref>
                      <Menu.Item leftSection={<FontAwesomeIcon icon={faSkullCrossbones} size={'sm'} stroke={'1.5'} />}>
                          Enemies
                        </Menu.Item>
                      </Link>
                      <Link href="/social/requests" passHref>
                      <Menu.Item leftSection={<FontAwesomeIcon icon={faComments} size={'sm'} stroke={'1.5'} />}>
                          Friend Requests
                        </Menu.Item>
                    </Link>
                  </Menu.Dropdown>
                </Menu>
                <Menu
                  width={260}
                  position="bottom-end"
                  transitionProps={{ transition: 'pop-top-right' }}
                  onClose={() => setUserMenuOpened(false)}
                  onOpen={() => setUserMenuOpened(true)}
                  withinPortal
                >
                  <Menu.Target>
                    <i className="ra ra-player ra-fw text-gradient-orange bg-orange-gradient text-shadow text-shadow-xs" style={{ cursor: 'pointer' }} />
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Settings</Menu.Label>
                    <Link href="/home/settings" passHref>
                      <Menu.Item leftSection={<FontAwesomeIcon icon={faGear} size={'sm'} stroke={'1.5'} />}>
                        <UnstyledButton component="a">
                          Account settings
                        </UnstyledButton>
                      </Menu.Item>
                    </Link>
                    <Link href="/home/profile" passHref>
                      <Menu.Item leftSection={<FontAwesomeIcon icon={faIdCard} size={'sm'} stroke={'1.5'} />}>

                        Profile Settings
                      </Menu.Item>

                    </Link>
                    <Menu.Item leftSection={<FontAwesomeIcon icon={faArrowRightFromBracket} size={'sm'} stroke={'1.5'} color={'indianred'} />}>
                      <span onClick={() => signOut({ callbackUrl: '/' })}>
                        Logout
                      </span>
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            )}
          </Container>
        </header>
        <Space h="md" />
        <SimpleGrid cols={1}>
          {alertService.alert && (
            <Group grow>
              <Alert />
            </Group>
          )}
        </SimpleGrid>
        <Space h="md" />
        {children}
      </div>
    );
  }
);

export default MainArea;
