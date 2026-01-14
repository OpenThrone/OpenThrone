import React, { forwardRef, useCallback, useEffect, useState } from "react";
import {
  Space,
  Group,
  SimpleGrid,
  Container,
  Menu,
  UnstyledButton,
  Title,
  Badge,
  Text,
  ScrollArea,
  Alert,
} from "@mantine/core"; // Added ScrollArea
import { alertService } from "../services/Alert.service";
import {
  faArrowRightFromBracket,
  faComments,
  faGear,
  faIdCard,
  faSkullCrossbones,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useLayout } from "@/context/LayoutContext";
import RpgAwesomeIcon from "./RpgAwesomeIcon";
import { useUser } from "@/context/users";
import { formatLastMessageTime } from "@/utils/timefunctions"; // Import time formatter
import useSocket from "@/hooks/useSocket";
import HeaderIconButton from "./HeaderIconButton";
interface MainAreaProps {
  title: string;
  children: React.ReactNode;
  paperWidth?: { sm: string; md: string };
}

const MainArea = forwardRef<HTMLDivElement, MainAreaProps>(function MainArea(
  { title, children, paperWidth },
  ref,
) {
  const { authorized } = useLayout();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  // Consume unread messages state and functions from context
  const { unreadMessages, unreadMessagesCount, markRoomAsRead, user } =
    useUser();
  const [messageMenuOpened, setMessageMenuOpened] = useState(false);
  const [socialNotificationCount, setSocialNotificationCount] =
    useState<number>(0);

  const enableEnemies = process.env.NEXT_PUBLIC_ENABLE_ENEMIES === "true";

  // Socket integration for real-time updates
  const { addEventListener, isConnected, removeEventListener } = useSocket(
    user?.id || null,
  );

  const fetchSocialNotificationCount = useCallback(async () => {
    try {
      const res = await fetch("/api/social/notifications/count");
      if (!res.ok) return;
      const data = await res.json();
      setSocialNotificationCount(Number(data.count) || 0);
    } catch (err) {
      // log error if needed
    }
  }, []);

  const handleMessageItemClick = (roomId: number) => {
    markRoomAsRead(roomId); // Mark room as read when clicking a message from it
    // Navigation will be handled by the Link component
  };

  useEffect(() => {
    fetchSocialNotificationCount();
    const interval = setInterval(fetchSocialNotificationCount, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSocialNotificationCount]);

  useEffect(() => {
    if (isConnected) {
      fetchSocialNotificationCount();
    }
  }, [fetchSocialNotificationCount, isConnected]);

  useEffect(() => {
    const handleFocus = () => fetchSocialNotificationCount();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchSocialNotificationCount();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchSocialNotificationCount]);

  // Socket event listeners for real-time social notification updates
  useEffect(() => {
    const handleSocialCountUpdate = (data: { count: number }) => {
      setSocialNotificationCount(data.count);
    };

    const handleFriendRequestNotification = (data: any) => {
      // Show toast notification for friend request
      alertService.success(
        `New friend request from ${data.senderName || "someone"}`,
      );
      // Refresh count
      fetchSocialNotificationCount();
    };

    const handleGoldRequestNotification = (data: any) => {
      // Show toast notification for gold request
      alertService.success(
        `New gold request from ${data.senderName || "someone"}`,
      );
      // Refresh count
      fetchSocialNotificationCount();
    };

    addEventListener("socialCountUpdate", handleSocialCountUpdate);
    addEventListener(
      "friendRequestNotification",
      handleFriendRequestNotification,
    );
    addEventListener("goldRequestNotification", handleGoldRequestNotification);

    return () => {
      removeEventListener("socialCountUpdate", handleSocialCountUpdate);
      removeEventListener(
        "friendRequestNotification",
        handleFriendRequestNotification,
      );
      removeEventListener(
        "goldRequestNotification",
        handleGoldRequestNotification,
      );
    };
  }, [addEventListener, removeEventListener, fetchSocialNotificationCount]);

  return (
    <div
      className="mainArea pb-10 w-full flex flex-col flex-grow overflow-y-auto"
      ref={ref || null}
    >
      <header className="main-header-titleBar"
        style={{
          height: "56px",
          borderBottom:
            "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          flexShrink: 0,
        }}
      >
        <Container
          fluid
          style={{
            height: "56px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingLeft: "16px",
            paddingRight: "16px",
          }}
        >
          <Title
            order={2}
            className="main-header-title text-gradient-orange bg-orange-gradient text-shadow text-shadow-xs"
            data-testid="page-title"
          >
            {title}
          </Title>
          {authorized && (
            <Group gap={"lg"} visibleFrom="md">
              <Menu
                width={320}
                position="bottom-end"
                transitionProps={{ transition: "pop-top-right" }}
                onClose={() => setMessageMenuOpened(false)}
                onOpen={() => setMessageMenuOpened(true)}
                withinPortal
                shadow="md"
              >
                <Menu.Target>
                      <div style={{ display: "inline-block" }}>
                        <HeaderIconButton
                          label="Messages"
                          count={unreadMessagesCount}
                          data-testid="action-button"
                        >
                          <FontAwesomeIcon icon={faComments} fixedWidth />
                        </HeaderIconButton>
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
                        .sort(
                          (a, b) =>
                            new Date(b.timestamp).getTime() -
                            new Date(a.timestamp).getTime(),
                        )
                        .slice(0, 10) // Limit displayed messages
                        .map((msg) => (
                          <Menu.Item
                            key={msg.id}
                            component={Link}
                            href={`/messaging?roomId=${msg.chatRoomId}`}
                            onClick={() =>
                              handleMessageItemClick(msg.chatRoomId)
                            } // Use handler
                            style={{
                              whiteSpace: "normal", // Allow text wrapping
                              height: "auto", // Adjust height automatically
                              paddingTop: "8px",
                              paddingBottom: "8px",
                            }}
                          >
                            <div>
                              <Group justify="space-between" mb={4}>
                                <Text fw={500} size="sm" truncate>
                                  {msg.senderName}
                                </Text>
                                <Text c="dimmed" size="xs">
                                  {formatLastMessageTime(msg.timestamp)}
                                </Text>
                              </Group>
                              <Text size="xs" lineClamp={2}>
                                {" "}
                                {/* Allow 2 lines */}
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
              <Menu
                width={260}
                position="bottom-end"
                transitionProps={{ transition: "pop-top-right" }}
                onClose={() => setUserMenuOpened(false)}
                onOpen={() => setUserMenuOpened(true)}
                withinPortal
              >
                <Menu.Target>
                    <div style={{ display: "inline-block" }}>
                      <HeaderIconButton label="Social" count={socialNotificationCount}>
                        <RpgAwesomeIcon icon="double-team" fw />
                      </HeaderIconButton>
                    </div>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>Social</Menu.Label>
                  <Link href="/social/friends" passHref>
                    <Menu.Item
                      leftSection={
                        <FontAwesomeIcon
                          icon={faIdCard}
                          size={"sm"}
                          stroke={"1.5"}
                        />
                      }
                    >
                      Friends
                    </Menu.Item>
                  </Link>
                  <Link href="/social/enemies" passHref hidden={!enableEnemies}>
                    <Menu.Item
                      leftSection={
                        <FontAwesomeIcon
                          icon={faSkullCrossbones}
                          size={"sm"}
                          stroke={"1.5"}
                        />
                      }
                    >
                      Enemies
                    </Menu.Item>
                  </Link>
                  <Link href="/social/requests" passHref>
                    <Menu.Item
                      leftSection={
                        <FontAwesomeIcon
                          icon={faComments}
                          size={"sm"}
                          stroke={"1.5"}
                        />
                      }
                      rightSection={
                        <Badge
                          color="red"
                          variant="filled"
                          size="xs"
                          display={
                            socialNotificationCount > 0 ? "none" : "none"
                          }
                        >
                          {socialNotificationCount > 9
                            ? "9+"
                            : socialNotificationCount}
                        </Badge>
                      }
                    >
                      Friend Requests
                    </Menu.Item>
                  </Link>
                </Menu.Dropdown>
              </Menu>
              <Menu
                width={260}
                position="bottom-end"
                transitionProps={{ transition: "pop-top-right" }}
                onClose={() => setUserMenuOpened(false)}
                onOpen={() => setUserMenuOpened(true)}
                withinPortal
              >
                <Menu.Target>
                    <div style={{ display: "inline-block" }}>
                      <HeaderIconButton label="Settings">
                        <RpgAwesomeIcon icon="player" fw />
                      </HeaderIconButton>
                    </div>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Settings</Menu.Label>
                  <Link href="/home/settings" passHref>
                    <Menu.Item
                      leftSection={
                        <FontAwesomeIcon
                          icon={faGear}
                          size={"sm"}
                          stroke={"1.5"}
                        />
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
                          size={"sm"}
                          stroke={"1.5"}
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
                        size={"sm"}
                        stroke={"1.5"}
                        color={"indianred"}
                      />
                    }
                  >
                    <span onClick={() => signOut({ callbackUrl: "/" })}>
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
      {children}
    </div>
  );
});

export default MainArea;
