import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { useState } from 'react';
import { Button, Table, Group, Modal, Title, Container, Paper } from '@mantine/core';
import prisma from '@/lib/prisma';
import ComposeForm from '@/components/compose-form';
import { InferGetServerSidePropsType } from "next";

const handleReply = async (message) => {
  const replySubject = `Re: ${message.subject}`;
  const replyBody = ''; // This can be from a textarea or input
  const response = await fetch('/api/messages/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalMessageId: message.id,
      subject: replySubject,
      body: replyBody,
    }),
  });
  const data = await response.json();
  // Handle the response (e.g., refresh the page, show a success message, etc.)
};

const handleForward = async (message) => {
  // Similar to handleReply but with forwarding logic
  const forwardSubject = `Fwd: ${message.subject}`;
  const forwardBody = ''; // This can be from a textarea or input
  const recipientId = null; // This should be the ID of the user you want to forward the message to
  const response = await fetch('/api/messages/forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalMessageId: message.id,
      recipientId,
      subject: forwardSubject,
      body: forwardBody,
    }),
  });
  const data = await response.json();
  // Handle the response
};

const handleDelete = async (messageId) => {
  // Logic to mark the message as deleted for the recipient
  // Update the database and then update the state or refresh the page
  const response = await fetch(`/api/messages/delete/${messageId}`, {
    method: 'PUT',
  });
  const data = await response.json();
  // Handle the response (e.g., remove the message from the state, show a success message, etc.)
  setMessages((prevMessages) =>
    prevMessages.filter((msg) => msg.id !== messageId)
  );
};

const Inbox = ({ messages, session }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [composeModalOpen, setComposeModalOpen] = useState(false);

  return (
    <Container>
      <Title order={1} mb="xl">Inbox</Title>
      <Group mb="xs">
        <Button onClick={() => setComposeModalOpen(true)}>Compose</Button>
      </Group>
      <Modal
        opened={composeModalOpen}
        onClose={() => setComposeModalOpen(false)}
        title="Compose Message"
        size="lg"
      >
        <ComposeForm onClose={() => setComposeModalOpen(false)} />
      </Modal>
      <Paper className="my-5 rounded-lg bg-gray-800">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>From</Table.Th>
            <Table.Th>Subject</Table.Th>
            <Table.Th>Date/Time</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {messages && messages.map((message) => (
            <Table.Tr key={message.id}>
              <Table.Td>{message?.from_user?.display_name ?? ''}</Table.Td>
              <Table.Td>
                <Link href={`/messaging/read/${message.id}`} passHref>
                  {message.subject}
                </Link>
              </Table.Td>
              <Table.Td>{new Date(message.date_time).toLocaleString()}</Table.Td>
              <Table.Td>
                <Group spacing="xs">
                  <Button size="xs" onClick={() => handleReply(message)}>Reply</Button>
                  <Button size="xs" onClick={() => handleForward(message)}>Forward</Button>
                  <Button size="xs" color="red" onClick={() => handleDelete(message.id)}>Delete</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        </Table>
      </Paper>
    </Container>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);

  if (!session) {
    // If no user is authenticated, redirect to the login page
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  // Fetch messages for the logged-in user, including the from_user relation
  const messages = await prisma.messages.findMany({
    where: {
      to_user_id: session.user.id,
    },
    include: {
      from_user: true,  // Include the from_user relation
    },
  });

  return {
    props: {
      messages,
      session,
    },
  };
};

export default Inbox;
