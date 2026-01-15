import '@mantine/tiptap/styles.css';

import {
  Button,
  Group,
  MultiSelect,
  Paper,
  Space,
  TextInput,
} from '@mantine/core';
import { Link, RichTextEditor } from '@mantine/tiptap';
import Highlight from '@tiptap/extension-highlight';
import SubScript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import React, { useState } from 'react';
import { Markdown } from 'tiptap-markdown';

import { alertService } from '@/services/Alert.service';
import type { ComposeFormProps } from '@/types/typings';

export default function ComposeForm({ onClose }: ComposeFormProps) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [possibleMatches, setPossibleMatches] = useState<string[]>([]);
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
    } else {
      setPossibleMatches([]);
    }
  };

  const handleSubmit = async () => {
    if (!recipients.length) {
      alertService.error('Invalid recipient');
      return;
    }
    const response = await fetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        recipients,
        subject,
        body: editor.storage.markdown.getMarkdown(),
      }),
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
    <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg">
      <MultiSelect
        data={possibleMatches}
        placeholder="Add recipients..."
        value={recipients}
        onChange={setRecipients}
        searchable
        onSearchChange={handleRecipientChange}
        label="Recipients"
        searchValue={recipient}
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

      <Group mt="md">
        <Button onClick={handleSubmit} disabled={recipients.length === 0}>
          Send
        </Button>
        <Button color="red" onClick={onClose}>
          Close
        </Button>
      </Group>
    </Paper>
  );
}
