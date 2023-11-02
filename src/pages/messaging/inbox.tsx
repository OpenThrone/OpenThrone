import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { useState } from 'react';
import prisma from '@/lib/prisma';
import ComposeModal from '@/components/composemodal';

const handleReply = async (message) => {
  // Redirect to a composition page or open a modal
  // Prepopulate with "Re: [Original Subject]" and original sender as recipient
  // On submission, POST to /api/messages/reply with necessary data
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

const Inbox = ({ messages, session }) => {
  const [composeModalOpen, setComposeModalOpen] = useState(false);

  
  console.log(messages);
  return (
    <div className="mx-auto w-full py-2">
      <h1 className="mb-4 text-2xl font-bold">Inbox</h1>
      <div>
        <button type="button" onClick={() => setComposeModalOpen(true)}>
          Compose
        </button>
        {composeModalOpen && (
          <ComposeModal onClose={() => setComposeModalOpen(false)} />
        )}

        <table class="w-full">
          <thead>
            <tr>
              <th>From</th>
              <th>Subject</th>
              <th>Date/Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
          {messages && messages.map((message) => (
            <tr key={message.id}>
              <td>{message?.from_user?.display_name ?? ''}</td>
              <td>
                <Link href={`/messaging/read/${message.id}`}>{message.subject}</Link>
              </td>
              <td>{new Date(message.date_time).toLocaleString()}</td>
              <td>
                <button type="button" onClick={() => handleReply(message)}>
                  Reply
                </button>
                <button type="button" onClick={() => handleForward(message)}>
                  Forward
                </button>
                <button type="button" onClick={() => handleDelete(message.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};


export const getServerSideProps = async (context: any) => {
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
}

export default Inbox;
