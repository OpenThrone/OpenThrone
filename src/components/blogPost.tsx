/* eslint-disable @next/next/no-img-element */
import React, { useMemo, useCallback } from "react";
import {
  Space,
  Title,
  Text,
  Badge,
  Group,
  ActionIcon,
  Tooltip,
  Switch,
  Divider,
  Stack,
} from "@mantine/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import ContentCard from "./ContentCard";

/** @param {string|number|Date} ts */
const formatDate = (ts: any) => {
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
};

/** @param {string} markdown */
const estimateReadTime = (markdown = "") => {
  const words = markdown
    .replace(/<[^>]*>/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
};

type BlogPostProps = {
  post: any;
  loggedIn: boolean;
  handleReadChange: (id: string) => void;
};

const BlogPost = ({ post, loggedIn, handleReadChange }: BlogPostProps) => {
  const readTime = useMemo(
    () => estimateReadTime(post?.content ?? ""),
    [post?.content],
  );

  const onShare = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.title, url });
        return;
      }
      if (navigator.clipboard && url) await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }, [post?.title]);

  return (
    <>
      <div key={post.id} className="mx-auto w-full px-4">
        <ContentCard
          title={post.title}
          titleSize="xl"
          titlePosition="left"
          className="w-full"
          minWidth={360}
          minHeight={220}
          variant="news"
          actions={
            <div className="flex flex-col items-end gap-1">
              <Text size="xs" c="dimmed" className="opacity-70">
                {formatDate(post.created_timestamp)} • {readTime}
              </Text>

              <Group gap={8} wrap="nowrap">
                {loggedIn && (
                  <Switch
                    size="xs"
                    checked={Boolean(post.isRead)}
                    onChange={() => handleReadChange(post.id)}
                    onLabel="READ"
                    offLabel="NEW"
                    styles={{
                      track: { border: "1px solid rgba(255,255,255,0.12)" },
                      thumb: { boxShadow: "none" },
                    }}
                  />
                )}

                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={onShare}
                  aria-label="Share post"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M16 6l-4-4-4 4M12 2v14"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ActionIcon>
              </Group>
            </div>
          }
        >
          <Stack gap="md">
            {post.image && (
              <img
                src={post.image}
                alt={post.title ?? "hero image"}
                className="w-full h-64 object-cover rounded-lg"
              />
            )}

            <Divider opacity={0.25} />

            <div className="prose prose-invert max-w-none">
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={{
                  h1: ({ ...props }) => <Title order={2} {...props} />,
                  h2: ({ ...props }) => <Title order={3} {...props} />,
                  h3: ({ ...props }) => <Title order={4} {...props} />,
                  p: ({ ...props }) => (
                    <Text component="p" size="md" lh={1.7} className="my-2">
                      {props.children}
                    </Text>
                  ),
                  a: ({ ...props }) => (
                    <a
                      {...props}
                      className="text-yellow-300 hover:underline underline-offset-4"
                    />
                  ),
                  img: ({ ...props }) => (
                    <img
                      {...props}
                      className="w-full h-auto rounded-lg"
                      alt={props.alt ?? ""}
                    />
                  ),
                  blockquote: ({ ...props }) => (
                    <blockquote className="border-l-2 border-yellow-300/40 pl-4 opacity-95">
                      {props.children}
                    </blockquote>
                  ),
                }}
              >
                {post.content}
              </Markdown>
            </div>

            {post.tags?.length ? (
              <Group gap={8}>
                {post.tags.map((t: string) => (
                  <Badge
                    key={t}
                    variant="light"
                    radius="sm"
                    className="bg-[#0f1720] text-yellow-200 border border-white/10"
                  >
                    {t}
                  </Badge>
                ))}
              </Group>
            ) : null}
          </Stack>
        </ContentCard>
      </div>

      <Space h="lg" />
    </>
  );
};

export default BlogPost;
