import { alertService } from '@/services';
import { ComposeFormProps } from '@/types/typings';
import React, { useState } from 'react';

export default function ComposeForm({ onClose }: ComposeFormProps) {
  const [recipients, setRecipients] = useState([]);
  const [recipient, setRecipient] = useState(''); 
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [possibleMatches, setPossibleMatches] = useState([]);
  const [possibleRecipients, setPossibleRecipients] = useState([]);
  const [recipientValid, setRecipientValid] = useState<boolean>(false); // null: not checked, true: valid, false: invalid
  const handleInputChange = (e) => {
    setRecipient(e.target.value);
  };
  const handleRecipientChange = async (value: string) => {
  //setRecipient(value);

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
    addRecipient(value)
  } else {
    setRecipientValid(false);
  }
  };
  
  const addRecipient = (recipientName) => {
    if (!recipients.includes(recipientName)) {
      setRecipients((currentRecipients) => [...currentRecipients, recipientName]);
      setRecipient(''); // Clear the input box after adding
      setRecipientValid(null); // Reset the validation state
      setPossibleMatches([]); // Clear the possible matches
    }
  };

  const removeRecipient = (recipientToRemove) => {
    setRecipients((currentRecipients) =>
      currentRecipients.filter((recipient) => recipient !== recipientToRemove)
    );
  };

  const handleSubmit = async () => {
    const response = await fetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({ recipient, subject, body }),
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    console.log('data', data)
    if (data.success) {
      onClose();
      // Optionally, you can provide a success message or refresh the inbox.
    } else {
      // Handle the error
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '5px', border: '2px solid #333', borderRadius: '5px' }}>
        {recipients.map((recipient) => (
          <span key={recipient} style={{ display: 'flex', alignItems: 'center', background: '#555', color: 'white', padding: '5px', borderRadius: '999px' }}>
            {recipient}
            <button onClick={() => removeRecipient(recipient)} style={{ marginLeft: '5px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
              ×
            </button>
          </span>
        ))}
        <input
          className='bg-black text-white border-2 border-gray rounded-md p-2 w-full focus:outline-none focus:border-blue-500'
          list="recipients"
          value={recipient}
          onChange={handleInputChange}
          onKeyDown={(e) => (e.key === ' ' ? handleRecipientChange(recipient) : null)} // Add recipient on Enter key press
          placeholder="Add recipient..."
          style={{
            flex: '1', padding: '5px',
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
