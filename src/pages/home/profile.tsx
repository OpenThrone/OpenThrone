import { useEffect, useState } from "react";
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { getSafeLocale } from '@/utils/i18n';

import { RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link as tiptapLink } from "@tiptap/extension-link";
import { Superscript } from "@tiptap/extension-superscript";
import { Subscript } from "@tiptap/extension-subscript";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Markdown } from "tiptap-markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { useUser } from "@/context/users";
import { alertService } from "@/services/Alert.service";
import {
  Group,
  Space,
  Avatar,
  Button,
  Text,
  FileButton,
  Grid
} from "@mantine/core";
import Link from "next/link";
import MainArea from "@/components/MainArea";
import { logDebug } from "@/utils/logger";
import { GameCard } from "@/components/game/GameCard";
import { InferGetServerSidePropsType } from "next";

const Profile = (props: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('home');
  const [file, setFile] = useState<File | null>(null);
  const { user, forceUpdate } = useUser();
  const [initialContent, setInitialContent] = useState("This feature is not implemented yet");
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
      Markdown,  // Include Markdown extension
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
          .replace(/\n\n/g, "\n");
        
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
      logDebug("Loading is true");
      return;
    }
    if (!editor) {
      return;
    }
    if(markdownContent !== initialContent) {
      setContentChanged(true);
    } else {
      setContentChanged(false);
    }
  }, [markdownContent, initialContent, loading, editor]);

  useEffect(() => {
    if (!editor) {
      return
    }
    if (loading && user) {
      setInitialContent(user.bio);
      setMarkdownContent(user.bio);
      editor.commands.setContent(user.bio);
      setLoading(false);
    }
  }, [loading, user, editor]);

  const saveProfile = async () => {
    console.log(editor.storage.markdown.getMarkdown())
    if (loading)
      return;

    if (file || contentChanged) {
      const formData = new FormData();
      if (contentChanged) {
        formData.append("bio", editor.storage.markdown.getMarkdown());
      }
      if (file) {
        formData.append("avatar", file);
      }

      try {
        const response = await fetch("/api/account/profile", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          const msg = (err) => { // TODO: Need to identify different errors that aren't understood well
            if (err.includes("options.maxTotalFileSize")) {
              return t('profile.fileSizeLimit');
            }
            return err;
          }
          throw new Error(msg(data.error));
        }

        setInitialContent(user.bio);
        setMarkdownContent(user.bio);

        alertService.success(t('profile.fileUploadedSuccessfully'));
        forceUpdate();
      } catch (error) {
        alertService.error(t('profile.errorUploadingFile') + " " + error.message);
      }
    }
  };

  return (
    <MainArea
      title={t('profile.title')}>
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <GameCard title={t('profile.currentAvatar')}>
            <Group align="center" mt="md">
              <Avatar src={user?.avatar} size={150} radius="md" />
            </Group>
          </GameCard>
        </Grid.Col>
        <Grid.Col span={6}>
          <GameCard title={t('profile.newAvatar')}>
            <Text size="sm" c="dimmed">{t('profile.limits')}</Text>
            <Group align="center" mt="md">
              <Avatar src={file ? URL.createObjectURL(file) : ""} size={150} radius="md" />
              <FileButton accept="image/jpeg, image/jpg, image/gif, image/png, image/webp" onChange={setFile}>
                {(props) => <Button {...props} color="yellow">{t('profile.uploadImage')}</Button>}
              </FileButton>
            </Group>
          </GameCard>
        </Grid.Col>
      </Grid>
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
          <Button
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={saveProfile}
          >
            {t('profile.saveProfile')}
          </Button>
          <Link href={'/userprofile/' + user?.id}>
            <Button className="rounded bg-green-700 px-4 py-2 font-bold text-white hover:bg-blue-700">
            {t('profile.viewProfile')}
            </Button>
          </Link>
        </Group>
      </GameCard>
    </MainArea>
  );
};

export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(getSafeLocale(context), ['home'])),
    },
  };
};

export default Profile;
