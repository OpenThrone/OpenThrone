import {
  faArrowRightFromBracket,
  faComments,
  faGear,
  faIdCard,
  faSkullCrossbones,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Badge,
  Box,
  Container,
  Group,
  Menu,
  Space,
  Title,
  UnstyledButton,
} from '@mantine/core';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { ForceDuesNotice } from '@/components/alliance/ForceDuesNotice';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import ChatNotificationItems from '@/components/game/ChatNotificationItems';
import frameClasses from '@/components/game/FantasyFrame.module.css';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';

import HeaderIconButton from './HeaderIconButton';
import classes from './MainArea.module.css';
import RpgAwesomeIcon from './RpgAwesomeIcon';

interface MainAreaProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  paperWidth?: { sm: string; md: string };
}

const MainArea = forwardRef<HTMLDivElement, MainAreaProps>(function MainArea(
  { title, icon, children, paperWidth: _paperWidth },
  ref,
) {
  const { authorized } = useLayout();
  const { t } = useTranslation('common');
  const { unreadMessages, unreadMessagesCount, markRoomAsRead } = useUser();
  const { config } = useRuntimeConfig();
  const [isMessageMenuOpened, setMessageMenuOpened] = useState(false);
  const [isSocialMenuOpened, setSocialMenuOpened] = useState(false);
  const [isSettingsMenuOpened, setSettingsMenuOpened] = useState(false);
  const [socialNotificationCount, setSocialNotificationCount] = useState(0);
  const enableEnemies = config?.enableEnemies === true;
  const enableSocial = config?.enableSocial === true;

  const fetchSocialNotificationCount = useCallback(async () => {
    if (!authorized || !enableSocial) return;
    try {
      const res = await fetch('/api/social/notifications/count');
      if (!res.ok) return;
      const data = await res.json();
      setSocialNotificationCount(Number(data.count) || 0);
    } catch {
      // Intentionally silent - fetchSocialNotificationCount errors are non-critical
    }
  }, [authorized, enableSocial]);

  const handleMessageItemClick = useCallback(
    (roomId: number) => {
      markRoomAsRead(roomId);
    },
    [markRoomAsRead],
  );

  useEffect(() => {
    fetchSocialNotificationCount();
    const interval = setInterval(fetchSocialNotificationCount, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSocialNotificationCount]);

  useEffect(() => {
    const handleFocus = () => fetchSocialNotificationCount();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSocialNotificationCount();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchSocialNotificationCount]);

  return (
    <div
      className="mainArea flex w-full grow flex-col overflow-y-auto pb-10 pt-3"
      ref={ref || null}
    >
      <header
        className={`${classes.titleBar} ${frameClasses.surface} ${frameClasses.ornate}`}
        style={{
          minHeight: '56px',
          flexShrink: 0,
        }}
      >
        <Container
          fluid
          style={{
            minHeight: '56px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            paddingTop: '8px',
            paddingBottom: '8px',
            paddingLeft: '24px',
            paddingRight: '24px',
          }}
        >
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            {icon && (
              <Box
                c="var(--ot-accent)"
                fz={28}
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                {icon}
              </Box>
            )}
            <Title
              order={1}
              size="h2"
              className="main-header-title"
              data-testid="page-title"
            >
              {title}
            </Title>
          </Group>
          {authorized && (
            <Group gap="lg" visibleFrom="md">
              <Menu
                width={320}
                position="bottom-end"
                transitionProps={{ transition: 'pop-top-right' }}
                onClose={() => setMessageMenuOpened(false)}
                onOpen={() => setMessageMenuOpened(true)}
                opened={isMessageMenuOpened}
                withinPortal
                shadow="md"
              >
                <Menu.Target>
                  <HeaderIconButton
                    label="Messages"
                    count={unreadMessagesCount}
                    data-testid="action-button"
                  >
                    <FontAwesomeIcon icon={faComments} fixedWidth />
                  </HeaderIconButton>
                </Menu.Target>

                <Menu.Dropdown>
                  <ChatNotificationItems
                    messages={unreadMessages}
                    onRoomSelect={handleMessageItemClick}
                  />
                </Menu.Dropdown>
              </Menu>
              {enableSocial && (
                <Menu
                  width={260}
                  position="bottom-end"
                  transitionProps={{ transition: 'pop-top-right' }}
                  onClose={() => setSocialMenuOpened(false)}
                  onOpen={() => setSocialMenuOpened(true)}
                  opened={isSocialMenuOpened}
                  withinPortal
                >
                  <Menu.Target>
                    <HeaderIconButton
                      label="Social"
                      count={socialNotificationCount}
                    >
                      <RpgAwesomeIcon icon="double-team" fw />
                    </HeaderIconButton>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Label>Social</Menu.Label>
                    <Link href="/social/friends" passHref>
                      <Menu.Item
                        leftSection={
                          <FontAwesomeIcon
                            icon={faIdCard}
                            size="sm"
                            stroke="1.5"
                          />
                        }
                      >
                        Friends
                      </Menu.Item>
                    </Link>
                    {enableEnemies && (
                      <Link href="/social/enemies" passHref>
                        <Menu.Item
                          leftSection={
                            <FontAwesomeIcon
                              icon={faSkullCrossbones}
                              size="sm"
                              stroke="1.5"
                            />
                          }
                        >
                          Enemies
                        </Menu.Item>
                      </Link>
                    )}
                    <Link href="/social/requests" passHref>
                      <Menu.Item
                        leftSection={
                          <FontAwesomeIcon
                            icon={faComments}
                            size="sm"
                            stroke="1.5"
                          />
                        }
                        rightSection={
                          <Badge color="red" variant="filled" size="xs">
                            {socialNotificationCount > 9
                              ? '9+'
                              : socialNotificationCount}
                          </Badge>
                        }
                      >
                        Friend Requests
                      </Menu.Item>
                    </Link>
                  </Menu.Dropdown>
                </Menu>
              )}
              <Menu
                width={260}
                position="bottom-end"
                transitionProps={{ transition: 'pop-top-right' }}
                onClose={() => setSettingsMenuOpened(false)}
                onOpen={() => setSettingsMenuOpened(true)}
                opened={isSettingsMenuOpened}
                withinPortal
              >
                <Menu.Target>
                  <HeaderIconButton label="Settings">
                    <RpgAwesomeIcon icon="player" fw />
                  </HeaderIconButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Settings</Menu.Label>
                  <Link href="/home/settings" passHref>
                    <Menu.Item
                      leftSection={
                        <FontAwesomeIcon icon={faGear} size="sm" stroke="1.5" />
                      }
                    >
                      <UnstyledButton component="a">
                        Account settings
                      </UnstyledButton>
                    </Menu.Item>
                  </Link>
                  <Link href="/home/profile" passHref>
                    <Menu.Item
                      leftSection={
                        <FontAwesomeIcon
                          icon={faIdCard}
                          size="sm"
                          stroke="1.5"
                        />
                      }
                    >
                      Profile Settings
                    </Menu.Item>
                  </Link>
                  <Menu.Item
                    leftSection={
                      <FontAwesomeIcon
                        icon={faArrowRightFromBracket}
                        size="sm"
                        stroke="1.5"
                        color="indianred"
                      />
                    }
                    onClick={() => signOut({ callbackUrl: '/' })}
                  >
                    {t('logout')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <LanguageSwitcher />
            </Group>
          )}
        </Container>
      </header>
      <AnnouncementBanner />
      <Space h="md" />
      {authorized && <ForceDuesNotice />}
      {children}
    </div>
  );
});

export default memo(MainArea);
