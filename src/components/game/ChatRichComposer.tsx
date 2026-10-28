import { RichTextEditor } from '@mantine/tiptap';
import { Link } from '@tiptap/extension-link';
import { useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useTranslation } from 'next-i18next';
import { useEffect, useRef } from 'react';

import type { ChatRichContent } from '@/utils/chatContent';
import { isSafeChatLink } from '@/utils/chatContent';

import styles from './ChatThemed.module.css';

interface ChatRichComposerProps {
  value?: ChatRichContent;
  disabled: boolean;
  label: string;
  onChange: (content: string, richContent: ChatRichContent) => void;
  onSend: () => void;
  focusKey?: number;
}

export default function ChatRichComposer({
  value,
  disabled,
  label,
  onChange,
  onSend,
  focusKey,
}: ChatRichComposerProps) {
  const { t } = useTranslation('messaging');
  const callbacks = useRef({ onChange, onSend });
  callbacks.current = { onChange, onSend };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        validate: isSafeChatLink,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
    ],
    content: value?.doc ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: !disabled,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        'data-placeholder': label,
      },
      handleKeyDown: (view, event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.isComposing &&
          !view.composing &&
          !view.state.selection.$from.parent.type.spec.code
        ) {
          event.preventDefault();
          callbacks.current.onSend();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) =>
      callbacks.current.onChange(instance.getText({ blockSeparator: '\n' }), {
        version: 1,
        doc: instance.getJSON() as ChatRichContent['doc'],
      }),
  });
  useEffect(() => {
    if (focusKey) editor?.commands.focus('end');
  }, [editor, focusKey]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    if (!editor) return;
    const content = value?.doc ?? {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content))
      editor.commands.setContent(content, false);
  }, [editor, value]);
  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': label,
          'data-placeholder': label,
        },
      },
    });
  }, [editor, label]);

  return (
    <RichTextEditor
      editor={editor}
      className={styles.richComposer}
      withTypographyStyles={false}
      labels={{
        boldControlLabel: t('format.bold'),
        italicControlLabel: t('format.italic'),
        strikeControlLabel: t('format.strike'),
        codeControlLabel: t('format.code'),
        codeBlockControlLabel: t('format.codeBlock'),
        blockquoteControlLabel: t('format.quote'),
        linkControlLabel: t('format.link'),
        unlinkControlLabel: t('format.unlink'),
        linkEditorInputLabel: t('format.linkUrl'),
        linkEditorInputPlaceholder: 'https://',
        linkEditorSave: t('format.saveLink'),
        linkEditorExternalLink: t('format.externalLink'),
        linkEditorInternalLink: t('format.internalLink'),
      }}
    >
      <RichTextEditor.Toolbar
        className={styles.formatToolbar}
        aria-label={t('format.toolbar')}
      >
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Bold />
          <RichTextEditor.Italic />
          <RichTextEditor.Strikethrough />
          <RichTextEditor.Code />
          <RichTextEditor.Blockquote />
          <RichTextEditor.CodeBlock />
          <RichTextEditor.Link />
          <RichTextEditor.Unlink />
        </RichTextEditor.ControlsGroup>
      </RichTextEditor.Toolbar>
      <RichTextEditor.Content />
    </RichTextEditor>
  );
}
