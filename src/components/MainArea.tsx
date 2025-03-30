import React, { forwardRef, useEffect, useState } from 'react';
import { Space, Group, SimpleGrid, Container, Menu, UnstyledButton, Title, Badge, Text, ScrollArea } from '@mantine/core'; // Added ScrollArea
import Alert from './alert';
import { alertService } from '../services/alert.service';
import { faArrowRightFromBracket, faComments, faGear, faIdCard, faSkullCrossbones } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useLayout } from '@/context/LayoutContext';
import RpgAwesomeIcon from './RpgAwesomeIcon';
import { useUser } from '@/context/users';
import { formatLastMessageTime } from '@/utils/timefunctions'; // Import time formatter

interface MainAreaProps {
  title: string;
  children: React.ReactNode;
  paperWidth?: { sm: string; md: string };
}

const MainArea = forwardRef<HTMLDivElement, MainAreaProps>(
  function MainArea({ title, children, paperWidth }, ref) {
    const { authorized } = useLayout();
    const [userMenuOpened, setUserMenuOpened] = useState(false);
    // Consume unread messages state and functions from context
    const { unreadMessages, unreadMessagesCount, markRoomAsRead } = useUser();
    const [messageMenuOpened, setMessageMenuOpened] = useState(false);

    const handleMessageItemClick = (roomId: number) => {
      markRoomAsRead(roomId); // Mark room as read when clicking a message from it
      // Navigation will be handled by the Link component
    };

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

                <Menu
                  width={320} // Increased width
                  position="bottom-end"
                  transitionProps={{ transition: 'pop-top-right' }}
                  onClose={() => setMessageMenuOpened(false)}
                  onOpen={() => setMessageMenuOpened(true)}
                  withinPortal
                  shadow="md" // Added shadow
                >
                  <Menu.Target>
                    <div style={{ position: 'relative', cursor: 'pointer' }}>
                      <FontAwesomeIcon
                        icon={faComments}
                        style={{
                          color: 'orange'
                        }}
                        fixedWidth
                        size="sm"
                      />
                      {unreadMessagesCount > 0 && (
                        <Badge
                          color="red"
                          variant="filled"
                          size="xs" // Smaller badge
                          circle // Make it circular
                          style={{
                            position: 'absolute',
                            top: -5, // Adjust position
                            right: -8, // Adjust position
                            minWidth: 16, // Ensure minimum size
                            height: 16,
                            padding: '0 4px', // Adjust padding
                            lineHeight: '16px' // Center text vertically
                          }}
                        >
                          {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                        </Badge>
                      )}
                    </div>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Label>Recent Unread Messages</Menu.Label>
                    {unreadMessages.length === 0 ? (
                      <Menu.Item disabled>No unread messages</Menu.Item>
                    ) : (
                      // Scrollable area for messages
                      <ScrollArea.Autosize mah={300}>
                        {unreadMessages
                          // Sort by timestamp descending if needed
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .slice(0, 10) // Limit displayed messages
                          .map((msg) => (
                            <Menu.Item
                              key={msg.id}
                              component={Link}
                              href={`/messaging?roomId=${msg.chatRoomId}`}
                              onClick={() => handleMessageItemClick(msg.chatRoomId)} // Use handler
                              style={{
                                whiteSpace: 'normal', // Allow text wrapping
                                height: 'auto', // Adjust height automatically
                                paddingTop: '8px',
                                paddingBottom: '8px',
                              }}
                            >
                              <div>
                                <Group justify="space-between" mb={4}>
                                  <Text fw={500} size="sm" truncate>{msg.senderName}</Text>
                                  <Text c="dimmed" size="xs">
                                    {formatLastMessageTime(msg.timestamp)}
                                  </Text>
                                </Group>
                                <Text size="xs" lineClamp={2}> {/* Allow 2 lines */}
                                  {msg.content}
                                </Text>
                              </div>
                            </Menu.Item>
                          ))}
                      </ScrollArea.Autosize>
                    )}
                    <Menu.Divider />
                    <Menu.Item component={Link} href="/messaging">
                      See all messages
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                {/* --- Other Menus (Social, User Settings) remain the same --- */}
                <Menu
                  width={260}
                  position="bottom-end"
                  transitionProps={{ transition: 'pop-top-right' }}
                  onClose={() => setUserMenuOpened(false)}
                  onOpen={() => setUserMenuOpened(true)}
                  withinPortal
                >
                  <Menu.Target>
                    <RpgAwesomeIcon
                      icon="double-team"
                      color="orange"
                      fw
                      style={{ cursor: 'pointer' }}
                    />
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
                    <RpgAwesomeIcon
                      icon="player"
                      color="orange"
                      fw
                      style={{ cursor: 'pointer' }}
                    />
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