/** The intentionally small, versioned subset of Tiptap JSON accepted by chat. */
export interface ChatRichMark {
  type: 'bold' | 'italic' | 'strike' | 'code' | 'link';
  attrs?: { href: string };
}
export interface ChatRichNode {
  type: 'doc' | 'paragraph' | 'text' | 'hardBreak' | 'blockquote' | 'codeBlock';
  text?: string;
  content?: ChatRichNode[];
  marks?: ChatRichMark[];
}
export interface ChatRichContent {
  version: 1;
  doc: ChatRichNode;
}
export const CHAT_MAX_LENGTH = 4000;

export function isSafeChatLink(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    value.includes('\\') ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'))
    return true;
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function chatPlainText(node: ChatRichNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? [])
    .map(chatPlainText)
    .join(node.type === 'doc' || node.type === 'blockquote' ? '\n' : '');
}

/** Validate on the server and when rendering; no client HTML is ever trusted. */
export function parseChatRichContent(value: unknown): ChatRichContent {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.doc))
    throw new Error('Invalid rich message');
  if (JSON.stringify(value).length > 40000)
    throw new Error('Message is too large');
  let count = 0;
  const parseNode = (
    raw: unknown,
    depth: number,
    parent?: string,
  ): ChatRichNode => {
    if (!isRecord(raw) || depth > 12 || ++count > 1000)
      throw new Error('Invalid message structure');
    const type = raw.type as ChatRichNode['type'];
    if (
      ![
        'doc',
        'paragraph',
        'text',
        'hardBreak',
        'blockquote',
        'codeBlock',
      ].includes(type)
    )
      throw new Error('Unsupported message node');
    if ((!parent && type !== 'doc') || (parent && type === 'doc'))
      throw new Error('Invalid document');
    const inline = type === 'text' || type === 'hardBreak';
    if (parent === 'doc' || parent === 'blockquote') {
      if (inline) throw new Error('Expected a message block');
    } else if (parent && !inline) throw new Error('Expected inline content');
    if (parent === 'codeBlock' && type !== 'text')
      throw new Error('Invalid code block');
    const node: ChatRichNode = { type };
    if (type === 'text') {
      if (typeof raw.text !== 'string' || !raw.text)
        throw new Error('Invalid message text');
      node.text = raw.text;
    }
    if (raw.content !== undefined) {
      if (!Array.isArray(raw.content) || inline)
        throw new Error('Invalid message children');
      node.content = raw.content.map((child) =>
        parseNode(child, depth + 1, type),
      );
    }
    if (raw.marks !== undefined) {
      if (type !== 'text' || !Array.isArray(raw.marks) || raw.marks.length > 5)
        throw new Error('Invalid formatting');
      node.marks = raw.marks.map((mark): ChatRichMark => {
        if (
          !isRecord(mark) ||
          !['bold', 'italic', 'strike', 'code', 'link'].includes(
            String(mark.type),
          )
        )
          throw new Error('Unsupported formatting');
        if (mark.type === 'link') {
          if (!isRecord(mark.attrs) || !isSafeChatLink(mark.attrs.href))
            throw new Error('Invalid message link');
          return { type: 'link', attrs: { href: mark.attrs.href } };
        }
        return { type: mark.type as ChatRichMark['type'] };
      });
    }
    return node;
  };
  const doc = parseNode(value.doc, 0);
  if (chatPlainText(doc).length > CHAT_MAX_LENGTH)
    throw new Error('Message is too long');
  return { version: 1, doc };
}
