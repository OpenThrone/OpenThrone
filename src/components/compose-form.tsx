import { alertService } from '@/services';
import { ComposeFormProps } from '@/types/typings';
import React, { useState } from 'react';
import '@mantine/tiptap/styles.css';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import { Markdown } from 'tiptap-markdown';
import Alert  from '@/components/alert';
import { TextInput, Button, Paper, Group, MultiSelect, Space } from '@mantine/core';

export default function ComposeForm({ onClose }: ComposeFormProps) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [possibleMatches, setPossibleMatches] = useState<string[]>([]);
  const [recipientValid, setRecipientValid] = useState<boolean>(false); // null: not checked, true: valid, false: invalid

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Superscript,
      SubScript,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Markdown,
    ],
  });

  const handleRecipientChange = async (value: string) => {
    setRecipient(value);

    if (value.length > 0) {
      const res = await fetch('/api/general/checkDisplayName', {
        method: 'POST',
        body: JSON.stringify({ displayName: value }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      setPossibleMatches(data.possibleMatches);

      const matches = data.possibleMatches.filter((name: string) =>
        name.toLowerCase().includes(value.toLowerCase())
      );

      if (matches.includes(value)) {
        setRecipientValid(true);
      } else {
        setRecipientValid(false);
      }
    } else {
      setPossibleMatches([]);
      setRecipientValid(false);
    }
  };

  const addRecipient = (recipientName: string) => {
    if (!recipients.includes(recipientName)) {
      setRecipients((currentRecipients) => [...currentRecipients, recipientName]);
      setRecipient(''); // Clear the input box after adding
      setRecipientValid(false); // Reset the validation state
      setPossibleMatches([]); // Clear the possible matches
    }
  };

  const handleSubmit = async () => {
    if (!recipients.length) {
      alertService.error('Invalid recipient');
      return;
    }
    const response = await fetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({ recipients, subject, body: editor.storage.markdown.getMarkdown() }),
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    if (data.success) {
      alertService.success('Message sent successfully');
      onClose();
    } else {
      alertService.error('Failed to send message');
    }
  };

  return (
    <>
      <Alert />
      <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg">
        <MultiSelect
          data={possibleMatches}
          placeholder="Add recipients..."
          value={recipients}
          onChange={setRecipients}
          searchable
          creatable
          getCreateLabel={(query) => `+ Add ${query}`}
          onCreate={(query) => addRecipient(query)}
          onItemSubmit={(item) => addRecipient(item.value)}
          onSearchChange={handleRecipientChange}
          label="Recipients"
          nothingFound="No matches"
          searchValue={recipient}
          onSearchValueChange={setRecipient}
        />


        <Space h="md" />

        <TextInput
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          label="Subject"
        />

        <Space h="md" />

        <RichTextEditor editor={editor}>
          <RichTextEditor.Toolbar sticky stickyOffset={60}>
            <RichTextEditor.ControlsGroup>
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
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Undo />
              <RichTextEditor.Redo />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>

          <RichTextEditor.Content />
        </RichTextEditor>

        <Group position="right" mt="md">
          <Button onClick={handleSubmit} disabled={recipients.length === 0}>
            Send
          </Button>
          <Button color="red" onClick={onClose}>Close</Button>
        </Group>
      </Paper>
    </>
  );
}
