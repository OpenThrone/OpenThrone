import { useState } from 'react';
import { useRouter } from 'next/router';
import MainArea from '@/components/MainArea';

const NewMessage = (props) => {
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  const createChatRoom = async () => {
    if (!recipients || !message) return;

    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: recipients.split(',').map((id) => parseInt(id, 10)),
        message,
      }),
    });
    router.push('/messaging');
  };

  return (
    <MainArea title="New Message">
      <input
        type="text"
        className="w-full p-2 border rounded"
        placeholder="Recipient IDs (comma-separated)"
        value={recipients}
        onChange={(e) => setRecipients(e.target.value)}
      />
      <textarea
        className="w-full p-2 border rounded mt-2"
        placeholder="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded mt-2"
        onClick={createChatRoom}
      >
        Create
      </button>
    </MainArea>
  );
};

export default NewMessage;
