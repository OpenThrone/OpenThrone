import { Image, Text } from '@mantine/core';
import { useState } from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import classes from '@/components/public/PublicPages.module.css';
import { resolveArtworkSource } from '@/utils/artwork';

interface MarkdownArticleProps {
  content: string;
  /** `compact` renders a dense excerpt (e.g. the overview dispatches card). */
  variant?: 'article' | 'compact';
}

function ArticleImage({
  src,
  alt = '',
  maxHeight = 640,
}: {
  src?: string;
  alt?: string;
  maxHeight?: number;
}) {
  const resolved = src ? resolveArtworkSource(src) : null;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!resolved || failedSource === resolved) {
    return alt ? (
      <Text component="span" c="var(--ot-muted)">
        {alt}
      </Text>
    ) : null;
  }
  return (
    <Image
      src={resolved}
      className="h-auto w-full"
      alt={alt}
      fit="contain"
      mah={maxHeight}
      onError={() => setFailedSource(resolved)}
    />
  );
}

/**
 * Single rendering path for blog/news bodies so the composer preview, the
 * published article and dispatch excerpts are guaranteed to match (same
 * plugins, same components). Headings keep their semantic level in every
 * variant; `compact` only scales them down.
 */
const MarkdownArticle = ({
  content,
  variant = 'article',
}: MarkdownArticleProps) => (
  <div
    className={
      variant === 'compact' ? classes.articlePreview : classes.articleBody
    }
  >
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      components={{
        a: (props) => (
          <a
            {...props}
            className="text-[var(--ot-heading)] underline underline-offset-4"
          />
        ),
        img: (props) => (
          <ArticleImage
            src={props.src}
            alt={props.alt}
            maxHeight={variant === 'compact' ? 160 : 640}
          />
        ),
      }}
    >
      {content}
    </Markdown>
  </div>
);

export default MarkdownArticle;
