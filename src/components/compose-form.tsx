import { ComposeFormProps } from '@/types/typings';
import React, { useState } from 'react';

export default function ComposeForm({ onClose }: ComposeFormProps) {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [possibleMatches, setPossibleMatches] = useState([]);
  const [possibleRecipients, setPossibleRecipients] = useState([]);
  const [recipientValid, setRecipientValid] = useState<boolean>(false); // null: not checked, true: valid, false: invalid

  const handleRecipientChange = async (value: string) => {
  setRecipient(value);

  // Fetch possible matches from the API
  const res = await fetch('/api/checkDisplayName', {
    method: 'POST',
    body: JSON.stringify({ displayName: value }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  setPossibleRecipients(data.possibleMatches);

  const matches = data.possibleMatches.filter((name: string) =>
    name.toLowerCase().includes(value.toLowerCase())
  );
  setPossibleMatches(matches);

  if (matches.includes(value)) {
    setRecipientValid(true);
  } else {
    setRecipientValid(false);
  }
};

  const handleSubmit = async () => {
    const response = await fetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({ recipient, subject, body }),
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    if (data.success) {
      onClose();
      // Optionally, you can provide a success message or refresh the inbox.
    } else {
      // Handle the error.
    }
  };

  return (
    <>
      
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <input
            list="recipients"
            value={recipient}
            onChange={(e) => handleRecipientChange(e.target.value)}
          placeholder="Recipient"
          className='bg-black text-white border-2 border-black rounded-md p-2 w-full focus:outline-none focus:border-blue-500'
            style={{
              width: '100%',
              borderColor:
                recipientValid === true
                  ? 'green'
                  : recipientValid === false
                    ? 'red'
                    : 'initial',
            }}
          />
          <datalist id="recipients">
            {possibleMatches.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className='bg-black text-white border-2 border-gray rounded-md p-2 w-full focus:outline-none focus:border-blue-500'
            style={{ width: '100%' }}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
          placeholder="Message body"
          className='bg-black text-white border-2 border-grey rounded-md p-2 w-full focus:outline-none focus:border-blue-500'
            style={{ width: '100%', minHeight: '4em' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className='p-2 border-blue-400 border-2 rounded-md' onClick={handleSubmit} disabled={recipientValid !== true}>
              Send
            </button>
          <button className='p-2 border-red-400 border-2 rounded-md' onClick={onClose}>Close</button>
          </div>
        </div>
    </>
  );
}
