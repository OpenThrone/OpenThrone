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
import { Title, Text, Table as MantineTable, Center, Space } from '@mantine/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// Initial Markdown content
const initialContent = '# Welcome to the Mantine rich text editor\n\nThis is a sample post. You can format your text, add headings, lists, and more.';

const Admin = (props) => {
  const [postHTML, setPostHTML] = useState(''); // Add this line to define postHTML state
  const [markdownContent, setMarkdownContent] = useState(initialContent);
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
    content: initialContent, // Set initial content as Markdown
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
    <div className="mainArea pb-10">
      <Text
        style={{
          background: 'linear-gradient(360deg, orange, darkorange)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '1.5rem',
          fontWeight: 'bold',
        }}
      >
        Overview
      </Text>
      <Space h="md" />
      <Center></Center>
      <div>
      <RichTextEditor editor={editor}>
        <RichTextEditor.Toolbar sticky stickyOffset={60}>
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

      <button onClick={handleCreatePost}>Submit Post</button>

      <h3>Live Preview</h3>
      <div
        dangerouslySetInnerHTML={{ __html: postHTML }}  // Render live HTML preview
        style={{
          border: '1px solid #ccc',
          padding: '1em',
          marginTop: '1em',
          borderRadius: '4px',
        }}
      ></div>

      <h3>Markdown Content</h3>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, ...props }) => <Title order={1} {...props} />,
          h3: ({ node, ...props }) => <Title order={3} {...props} />,
          h4: ({ node, ...props }) => <Title order={4} {...props} />,
          p: ({ node, ...props }) => (
            <Text component="p" fw="normal" size="lg" mb="xl" {...props} />
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

      </div>
    </div>
  );
};

export default Admin;
