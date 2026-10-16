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
}

function ArticleImage({ src, alt = '' }: { src?: string; alt?: string }) {
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
      mah={640}
      onError={() => setFailedSource(resolved)}
    />
  );
}

/**
 * Single rendering path for blog/news bodies so the composer preview and the
 * published article are guaranteed to match (same plugins, same components).
 */
const MarkdownArticle = ({ content }: MarkdownArticleProps) => (
  <div className={classes.articleBody}>
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
        img: (props) => <ArticleImage src={props.src} alt={props.alt} />,
      }}
    >
      {content}
    </Markdown>
  </div>
);

export default MarkdownArticle;
