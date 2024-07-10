import { useState } from 'react';
import { Button, Card, Center, Checkbox, Group, Space, Table, Text, Title, useMantineTheme } from '@mantine/core';

const SamplePage = (props) => {
  const theme = useMantineTheme();
  const [opened, setOpened] = useState(false);

  console.log('the mantineTheme is:', theme)

  const renderColorSquares = (colors: string[]) => {
    return colors.map((color, index) => (
      <div
        key={index}
        style={{
          backgroundColor: color,
          width: '40px',
          height: '40px',
          display: 'inline-block',
          margin: '5px',
        }}
      />
    ));
  };

  return (
    <div style={{ padding: '2rem' }}>
      <Center>
        <Title order={1} style={{ color: theme.colors.brand[9] }}>
          Test the Mantine Theme Options
        </Title>
      </Center>
      <Space h="md" />
      <Group position="center" spacing="md">
        <Button color="brand">Primary Button</Button>
        <Button color="secondary" variant='filled'>Secondary Button</Button>
      </Group>
      <Space h="md" />
      <Group position="center" spacing="md">
        <Button color="brand" variant="outline">
          Outline Button
        </Button>
        <Button color="secondary" variant="outline">
          Outline Button
        </Button>
      </Group>
      <Space h="md" />
      <Card shadow="sm" padding="lg" style={{ maxWidth: 400, margin: 'auto' }}>
        <Card.Section>
          <Center>
            <Title order={2}>Card Title</Title>
          </Center>
        </Card.Section>
        <Text align="center">
          This is a card component to show off the brand and secondary colors of the selected theme.
        </Text>
        <Group position="center" spacing="md" style={{ marginTop: '1rem' }}>
          <Button color="brand">Action 1</Button>
          <Button color="secondary">Action 2</Button>
        </Group>
      </Card>
      <Space h="md" />
      <Center>
        <Table highlightOnHover>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>UI Components</td>
              <td style={{ color: theme.colors.brand[6] }}>
                <Checkbox />
              </td>
            </tr>
            <tr>
              <td>Responsive Design</td>
              <td style={{ color: theme.colors.secondary[6] }}>
                <Checkbox />
              </td>
            </tr>
            <tr>
              <td>Dark Mode</td>
              <td style={{ color: theme.colors.brand[6] }}>
                <Checkbox />
              </td>
            </tr>
            <tr>
              <td>Light Mode</td>
              <td style={{ color: theme.colors.secondary[6] }}>
                X
              </td>
            </tr>
          </tbody>
        </Table>
      </Center>
      <Space h="md" />
      <Card shadow="sm" padding="lg" style={{ maxWidth: 400, margin: 'auto' }}>
        <Group position="center">
          <Button color="secondary" onClick={() => setOpened(!opened)}>
            Toggle Alert
          </Button>
        </Group>
        {opened && (
          <Text
            align="center"
            style={{
              marginTop: '1rem',
              backgroundColor: theme.colors.secondary[1],
              color: theme.colors.brand[7],
              padding: '0.5rem',
              borderRadius: '5px',
            }}
          >
             This is an alert message!
          </Text>
        )}
      </Card>
      <Space h="md" />
      <Group position="center" spacing="md">
        <Card shadow="sm" padding="lg" style={{ maxWidth: 400, margin: 'auto' }}>
          <Title order={3}>Brand Colors</Title>
          <Space h="md" />
          <Center>
            {renderColorSquares(theme.colors.brand)}
          </Center>
        </Card>
      </Group>
      <Space h="md" />
      <Group position="center" spacing="md">
        <Card shadow="sm" padding="lg" style={{ maxWidth: 400, margin: 'auto' }}>
          <Title order={3}>Secondary Colors</Title>
          <Space h="md" />
          <Center>
            {renderColorSquares(theme.colors.secondary)}
          </Center>
        </Card>
      </Group>
    </div>
  );
};

export default SamplePage;
