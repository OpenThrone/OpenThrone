import { useEffect, useState } from "react";
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
import { alertService } from "@/services";
import {
  Group,
  Table as MantineTable,
  Space,
  Avatar,
  Button,
  Card,
  Text,
  FileButton,
  Grid
} from "@mantine/core";
import Alert from "@/components/alert";
import Link from "next/link";
import MainArea from "@/components/MainArea";

const Profile = (props) => {
  const [file, setFile] = useState<File | null>(null);
  const { user, forceUpdate } = useUser();
  const [initialContent, setInitialContent] = useState("This feature is not implemented yet");
  const [loading, setLoading] = useState(true);
  const [markdownContent, setMarkdownContent] = useState(initialContent);
  const [contentChanged, setContentChanged] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const maxChars = 500;
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      tiptapLink,
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
      console.log("Loading is true");
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
  }, [markdownContent, initialContent, loading]);

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
              return "File size must be less than 1.5mb.";
            }
            return err;
          }
          throw new Error(msg(data.error));
        }

        setInitialContent(user.bio);
        setMarkdownContent(user.bio);

        alertService.success("File uploaded successfully.");
        forceUpdate();
      } catch (error) {
        alertService.error("Error uploading file. " + error.message);
      }
    }
  };

  return (
    <MainArea
      title="My Profile">
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw="bolder">
              Current Avatar
            </Text>
            <Space h="lg" />
            <Group align="center" mt="md">
              <Avatar src={user?.avatar} size={150} radius="md" />
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw="bolder">
              New Avatar
            </Text>
            <Text size="sm" color="dimmed">Limits: 450x450 and 1.5mb</Text>
            <Group align="center" mt="md">
              <Avatar src={file ? URL.createObjectURL(file) : ""} size={150} radius="md" />
              <FileButton accept="image/jpeg, image/jpg, image/gif, image/png, image/webp" onChange={setFile}>
                {(props) => <Button {...props}>Upload image</Button>}
              </FileButton>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>
      <Space h="md" />
      <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
        <Space h="md" />
        <Text size="xl" fw='bolder'>Profile Biography {contentChanged && (
          <span>
            <span style={{ color: 'red' }}>*</span>
            <span style={{ color: 'dimmed' }}>Unsaved changes</span>
          </span>
        ) }</Text>
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
          Character Count: {charCount}/{maxChars}
        </Text>
        <Space h="md" />
        <Group align="right" mt="md">
          <Button
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={saveProfile}
          >
            Save Profile
          </Button>
          <Link href={'/userprofile/' + user?.id}>
            <Button className="rounded bg-green-700 px-4 py-2 font-bold text-white hover:bg-blue-700">
            View Profile
            </Button>
          </Link>
        </Group>
      </Card>
    </MainArea>
  );
};

export default Profile;
