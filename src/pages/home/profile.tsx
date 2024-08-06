import React, { useState } from "react";
import { useUser } from "@/context/users";
import { alertService } from "@/services";
import {
  Group,
  Avatar,
  Button,
  Card,
  Text,
  TextInput,
  FileInput,
  Space,
  FileButton,
  Paper,
  Grid,
} from "@mantine/core";
import Alert from "@/components/alert";
import PageTemplate from "@/components/PageTemplate";

const Profile = (props) => {
  const [file, setFile] = useState<File | null>(null);
  const { user, forceUpdate } = useUser();

  const saveProfile = async () => {
    if (file) {
      const formData = new FormData();
      formData.append("avatar", file);

      try {
        const response = await fetch("/api/account/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          alertService.error("Error uploading file.");
          throw new Error("Network response was not ok");
        }

        const data = await response.json();
        alertService.success("File uploaded successfully.");
        forceUpdate();
      } catch (error) {
        console.error("Error uploading file:", error);
        alertService.error("Error uploading file.");
      }
    }
  };

  return (
    <PageTemplate title="Profile">
      <Alert />
      <Grid gutter="lg">
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" style={{ backgroundColor: '#1A1B1E' }}>
            <Text size="xl" fw="bolder">
              Current Avatar
            </Text>
            <Space h="lg" />
            <Group position="center" mt="md">
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
            <Group position="center" mt="md">
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
        <Text size="xl" fw='bolder'>Comments</Text>
        <TextInput
          placeholder="Enter Your Comments"
          className="w-full"
          style={{ backgroundColor: '#1A1B1E' }}
        />
        <Space h="md" />
        <Group position="right" mt="md">
          <Button
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            onClick={saveProfile}
          >
            Save Profile
          </Button>
          <Button className="rounded bg-green-700 px-4 py-2 font-bold text-white hover:bg-blue-700">
            View Profile
          </Button>
        </Group>
      </Card>
    </PageTemplate>
  );
};

export default Profile;
