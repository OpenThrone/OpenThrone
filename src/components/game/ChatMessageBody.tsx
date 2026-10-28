import { Anchor } from '@mantine/core';
import { Fragment, type ReactNode } from 'react';

import type { ChatRichNode } from '@/utils/chatContent';
import { parseChatRichContent } from '@/utils/chatContent';

import styles from './ChatThemed.module.css';

function renderNode(node: ChatRichNode, index: number): ReactNode {
  const children = node.content?.map(renderNode);
  switch (node.type) {
    case 'text':
      return (
        <Fragment key={index}>
          {(node.marks ?? []).reduce<ReactNode>((text, mark) => {
            switch (mark.type) {
              case 'bold':
                return <strong>{text}</strong>;
              case 'italic':
                return <em>{text}</em>;
              case 'strike':
                return <s>{text}</s>;
              case 'code':
                return <code>{text}</code>;
              case 'link':
                return (
                  <Anchor
                    href={mark.attrs?.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    inherit
                  >
                    {text}
                  </Anchor>
                );
              default:
                return text;
            }
          }, node.text)}
        </Fragment>
      );
    case 'hardBreak':
      return <br key={index} />;
    case 'paragraph':
      return <p key={index}>{children?.length ? children : <br />}</p>;
    case 'blockquote':
      return <blockquote key={index}>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={index}>
          <code>{children}</code>
        </pre>
      );
    default:
      return children;
  }
}

export default function ChatMessageBody({
  content,
  richContent,
}: {
  content: string;
  richContent?: unknown;
}) {
  let doc: ChatRichNode | null = null;
  try {
    if (richContent) doc = parseChatRichContent(richContent).doc;
  } catch {
    /* Legacy or unsupported versions use the plain-text fallback. */
  }
  return (
    <div className={styles.messageText}>
      {doc ? renderNode(doc, 0) : content}
    </div>
  );
}
