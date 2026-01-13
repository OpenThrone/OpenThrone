import { useEffect, useState } from 'react';
import { RichTextEditor } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Button, Table as MantineTable, Text, Title } from '@mantine/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import MainArea from '@/components/MainArea';
import { GameCard } from '@/components/game/GameCard';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { getSafeLocale } from '@/utils/i18n';
import { InferGetServerSidePropsType } from "next";

const Admin = (props: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('admin');
  const [postHTML, setPostHTML] = useState(''); // Add this line to define postHTML state
  const [markdownContent, setMarkdownContent] = useState(t('blog.initialContent'));
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Superscript,
      Subscript,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Markdown,  // Include the Markdown extension
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
        setMarkdownContent(editor.storage.markdown.getMarkdown().replace(/\n\n/g, '\n'));
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
      console.log('Post HTML:', postHTML);
    }
    if (markdownContent) {
      console.log('Markdown Content:', markdownContent);
    }
  });

  const handleCreatePost = () => {
    if (editor) {
      // Get the Markdown content when submitting
      const content = editor.storage.markdown.getMarkdown();
      console.log('Submitted Markdown Content:', content);
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

        <Button mt="md" color="yellow" onClick={handleCreatePost}>
          {t('blog.submitPost')}
        </Button>
      </GameCard>

      <GameCard title={t('blog.livePreview')} mt="md">
        <div
          dangerouslySetInnerHTML={{ __html: postHTML }}
          style={{
            border: '1px solid #2f3e52',
            padding: '1em',
            borderRadius: '6px',
            backgroundColor: '#0f141a',
          }}
        ></div>
      </GameCard>

      <GameCard title={t('blog.markdownContent')} mt="md">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            h1: ({ node, ...props }) => <Title order={1} {...props} />,
            h3: ({ node, ...props }) => <Title order={3} {...props} />,
            h4: ({ node, ...props }) => <Title order={4} {...props} />,
            p: ({ node, ...props }) => (
              <Text component="p" fw="normal" size="lg" mb="xl">{props.children}</Text>
            ),
            table: ({ node, ...props }) => (
              <MantineTable striped highlightOnHover withRowBorders withColumnBorders {...props} />
            ),
            th: ({ node, ...props }) => (
              <MantineTable.Th style={{ fontWeight: 'bold', textAlign: 'left', padding: '0.5em' }} {...props} />
            ),
            td: ({ node, ...props }) => (
              <MantineTable.Td style={{ padding: '0.5em' }} {...props} />
            ),
          }}
        >
          {markdownContent}
        </ReactMarkdown>
      </GameCard>
    </MainArea>
  );
};

export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(getSafeLocale(context), ['admin'])),
    },
  };
};

export default Admin;
