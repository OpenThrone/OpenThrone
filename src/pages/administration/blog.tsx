/* eslint-disable react/no-danger */
import { Button } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import { Markdown } from 'tiptap-markdown';

import { GameCard } from '@/components/game/GameCard';
import panelClasses from '@/components/game/Panels.module.css';
import MainArea from '@/components/MainArea';
import MarkdownArticle from '@/components/news/MarkdownArticle';
import { logDebug } from '@/utils/logger';

const Admin = () => {
  const { t } = useTranslation('admin');
  const [postHTML, setPostHTML] = useState(''); // Add this line to define postHTML state
  const [markdownContent, setMarkdownContent] = useState(
    t('blog.initialContent'),
  );
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Superscript,
      Subscript,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Markdown, // Include Markdown extension
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: t('blog.initialContent'), // Set initial content as Markdown
    onUpdate: ({ editor }) => {
      // Ensure editor is defined before accessing storage
      if (editor) {
        setMarkdownContent(
          editor.storage.markdown.getMarkdown().replace(/\n\n/g, '\n'),
        );
      }
    },
  });

  useEffect(() => {
    if (editor) {
      setPostHTML(editor.getHTML());
    }
  }, [markdownContent, editor]); // Update postHTML when markdownContent or editor changes

  useEffect(() => {
    if (postHTML) {
      logDebug('Post HTML:', postHTML);
    }
    if (markdownContent) {
      logDebug('Markdown Content:', markdownContent);
    }
  });

  const handleCreatePost = () => {
    if (editor) {
      // Get Markdown content when submitting
      const content = editor.storage.markdown.getMarkdown();
      logDebug('Submitted Markdown Content:', content);
      // You can send this Markdown content to your API or save it in your database
    }
  };

  return (
    <MainArea title={t('blog.title')}>
      <GameCard title={t('blog.postEditor')}>
        <RichTextEditor editor={editor}>
          <RichTextEditor.Toolbar stickyOffset={60}>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Underline />
              <RichTextEditor.Strikethrough />
              <RichTextEditor.ClearFormatting />
              <RichTextEditor.Highlight />
              <RichTextEditor.Code />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.H1 />
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
              <RichTextEditor.H4 />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Blockquote />
              <RichTextEditor.Hr />
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
              <RichTextEditor.Subscript />
              <RichTextEditor.Superscript />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.AlignLeft />
              <RichTextEditor.AlignCenter />
              <RichTextEditor.AlignJustify />
              <RichTextEditor.AlignRight />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Undo />
              <RichTextEditor.Redo />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>

          <RichTextEditor.Content />
        </RichTextEditor>

        <Button mt="md" onClick={handleCreatePost}>
          {t('blog.submitPost')}
        </Button>
      </GameCard>

      <GameCard title={t('blog.livePreview')} mt="md">
        {/* eslint-disable-next-line react/no-danger */}
        <div
          dangerouslySetInnerHTML={{ __html: postHTML }}
          className={panelClasses.insetRow}
        />
      </GameCard>

      <GameCard title={t('blog.markdownContent')} mt="md">
        <MarkdownArticle content={markdownContent} />
      </GameCard>
    </MainArea>
  );
};

export default Admin;
