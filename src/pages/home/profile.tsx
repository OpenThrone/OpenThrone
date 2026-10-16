import {
  Avatar,
  Button,
  FileButton,
  Grid,
  Group,
  Space,
  Stack,
  Text,
} from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import { Highlight } from '@tiptap/extension-highlight';
import { Link as tiptapLink } from '@tiptap/extension-link';
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
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState } from 'react';
import { Markdown } from 'tiptap-markdown';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import { AvatarFramingEditor } from '@/components/profile/AvatarFramingEditor';
import { ProfilePortrait } from '@/components/profile/ProfilePortrait';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { AvatarFraming } from '@/utils/avatarFraming';
import { splitAvatarFraming } from '@/utils/avatarFraming';
import { logDebug } from '@/utils/logger';

const Profile = () => {
  const { t } = useTranslation('home');
  const [file, setFile] = useState<File | null>(null);
  const { user, forceUpdate } = useUser();
  const [framingOpen, setFramingOpen] = useState(false);
  const [framingSaving, setFramingSaving] = useState(false);
  // Framing chosen for a not-yet-uploaded file; sent with the upload.
  const [pendingFraming, setPendingFraming] = useState<AvatarFraming | null>(
    null,
  );
  const fileUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : ''),
    [file],
  );
  useEffect(() => {
    setPendingFraming(null);
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);
  const storedAvatar = splitAvatarFraming(user?.avatar);
  const hasCustomAvatar =
    !!storedAvatar.src &&
    storedAvatar.src !== 'SHIELD' &&
    !storedAvatar.src.includes('/shields/');
  const [initialContent, setInitialContent] = useState(
    'This feature is not implemented yet',
  );
  const [loading, setLoading] = useState(true);
  const [markdownContent, setMarkdownContent] = useState(initialContent);
  const [contentChanged, setContentChanged] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const maxChars = 500;
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      tiptapLink,
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
    content: initialContent, // Set initial content as Markdown
    onUpdate: ({ editor }) => {
      // Ensure editor is defined before accessing storage
      if (editor) {
        let content = editor.storage.markdown
          .getMarkdown()
          .replace(/\n\n/g, '\n');

        // Enforce character limit
        if (content.length > maxChars) {
          content = content.substring(0, maxChars);
          editor.commands.setContent(content);
        }

        setMarkdownContent(content);
        setCharCount(content.length);
      }
    },
  });

  useEffect(() => {
    if (loading) {
      logDebug('Loading is true');
      return;
    }
    if (!editor) {
      return;
    }
    if (markdownContent !== initialContent) {
      setContentChanged(true);
    } else {
      setContentChanged(false);
    }
  }, [markdownContent, initialContent, loading, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (loading && user) {
      setInitialContent(user.bio);
      setMarkdownContent(user.bio);
      editor.commands.setContent(user.bio);
      setLoading(false);
    }
  }, [loading, user, editor]);

  const saveProfile = async () => {
    if (loading) return;

    if (file || contentChanged) {
      const formData = new FormData();
      if (contentChanged) {
        formData.append('bio', editor.storage.markdown.getMarkdown());
      }
      if (file) {
        formData.append('avatar', file);
        if (pendingFraming) {
          formData.append('avatarFraming', JSON.stringify(pendingFraming));
        }
      }

      try {
        const response = await fetch('/api/account/profile', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          const msg = (err) => {
            // TODO: Need to identify different errors that aren't understood well
            if (err.includes('options.maxTotalFileSize')) {
              return t('profile.fileSizeLimit');
            }
            return err;
          };
          throw new Error(msg(data.error));
        }

        setInitialContent(user.bio);
        setMarkdownContent(user.bio);
        if (file) setFile(null);

        alertService.success(t('profile.fileUploadedSuccessfully'));
        forceUpdate();
      } catch (error) {
        alertService.error(
          `${t('profile.errorUploadingFile')} ${error.message}`,
        );
      }
    }
  };

  const saveFraming = async (framing: AvatarFraming) => {
    if (file) {
      setPendingFraming(framing);
      setFramingOpen(false);
      return;
    }
    setFramingSaving(true);
    try {
      const formData = new FormData();
      formData.append('avatarFraming', JSON.stringify(framing));
      const response = await fetch('/api/account/profile', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? response.statusText);
      }
      alertService.success(t('profile.framingSaved'));
      setFramingOpen(false);
      forceUpdate();
    } catch (error) {
      alertService.error(
        `${t('profile.framingSaveFailed')} ${error.message ?? ''}`.trim(),
      );
    } finally {
      setFramingSaving(false);
    }
  };

  return (
    <MainArea title={t('profile.title')}>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <GameCard title={t('profile.currentAvatar')}>
            <Stack align="center" gap="md" mt="md">
              <ProfilePortrait
                race={user?.race}
                avatar={user?.avatar}
                style={{ width: 'min(300px, 100%)' }}
              />
              {hasCustomAvatar && !file && (
                <Button variant="outline" onClick={() => setFramingOpen(true)}>
                  {t('profile.adjustFraming')}
                </Button>
              )}
            </Stack>
          </GameCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <GameCard title={t('profile.newAvatar')}>
            <Text size="sm" c="dimmed">
              {t('profile.limits')}
            </Text>
            <Group align="center" mt="md">
              <Avatar src={fileUrl} size={150} radius="md" />
              <FileButton
                accept="image/jpeg, image/jpg, image/gif, image/png, image/webp"
                onChange={setFile}
              >
                {(props) => (
                  <Button {...props} color="yellow">
                    {t('profile.uploadImage')}
                  </Button>
                )}
              </FileButton>
              {file && (
                <Button variant="outline" onClick={() => setFramingOpen(true)}>
                  {t('profile.adjustFraming')}
                </Button>
              )}
            </Group>
            {file && pendingFraming && (
              <Text size="sm" c="dimmed" mt="sm">
                {t('profile.framingPending')}
              </Text>
            )}
          </GameCard>
        </Grid.Col>
      </Grid>
      <AvatarFramingEditor
        opened={framingOpen}
        onClose={() => setFramingOpen(false)}
        avatar={file ? fileUrl : storedAvatar.src}
        race={user?.race}
        initialFraming={file ? pendingFraming : storedAvatar.framing}
        saving={framingSaving}
        onSave={saveFraming}
      />
      <Space h="md" />
      <GameCard title={t('profile.profileBiography')}>
        <Space h="md" />
        {contentChanged && (
          <Text size="sm" c="red">
            {t('profile.unsavedChanges')}
          </Text>
        )}
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
        <Space h="md" />
        <Text size="sm" color="dimmed">
          {t('profile.characterCount', { count: charCount, max: maxChars })}
        </Text>
        <Space h="md" />
        <Group align="right" mt="md">
          <Button onClick={saveProfile}>{t('profile.saveProfile')}</Button>
          <Link href={`/userprofile/${user?.id}`}>
            <Button variant="default">{t('profile.viewProfile')}</Button>
          </Link>
        </Group>
      </GameCard>
    </MainArea>
  );
};

export default Profile;
