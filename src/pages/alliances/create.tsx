import { TextInput, Text, Button, Group, Alert, Loader, Textarea, FileInput, Paper } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useUser } from '@/context/users';

export default function CreateAlliance() {
  const { user } = useUser();

  const form = useForm({
    initialValues: {
      allianceName: '',
      description: '',
      joinText: '',
      avatar: null,
    },

    validate: {
      allianceName: (value) =>
        value.trim().length >= 3 ? null : 'Alliance name must be at least 3 characters long',
      description: (value) =>
        value.trim().length > 10 ? null : 'Description must be at least 10 characters long',
      joinText: (value) =>
        value.trim().length > 0 ? null : 'Join text must not be empty',
    },
  });

  if (!user) {
    return <Loader />;
  }

  if (user.level < 5) {
    return <Alert color="red">You must be at least level 10 to create an alliance.</Alert>;
  }

  if (user.gold < 100000000) {
    return <Alert color="red">Creating an alliance costs 100 million gold.</Alert>;
  }

  const handleSubmit = async (values) => {
    const formData = new FormData();
    formData.append('name', values.allianceName);
    formData.append('description', values.description);
    formData.append('joinText', values.joinText);
    if (values.avatar) {
      formData.append('avatar', values.avatar);
    }

    // Implement the API call here using formData
    console.log([...formData]); // Placeholder for API call
  };

  return (
    <Paper shadow='2' p="md">
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <TextInput
        label="Alliance Name"
        placeholder="Enter your alliance name"
        required
        {...form.getInputProps('allianceName')}
      />
      <Textarea
        label="Description"
        placeholder="Enter the alliance description"
        required
        {...form.getInputProps('description')}
      />
      <TextInput
        label="Join Text"
        placeholder="Enter the text shown on the join button"
        required
        {...form.getInputProps('joinText')}
      />
      <FileInput
        label="Alliance Avatar"
        placeholder="Upload an avatar"
        accept="image/png,image/jpeg"
        {...form.getInputProps('avatar')}
      />
      <Text>Cost: 100 Million Gold</Text>
      <Group mt="md">
        <Button type="submit">Create Alliance</Button>
      </Group>
      </form>
    </Paper>
  );
}