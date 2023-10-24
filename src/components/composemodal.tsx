// src/components/ComposeModal.tsx
import React, { useState } from 'react';

export default function ComposeModal({ onClose }) {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [possibleMatches, setPossibleMatches] = useState([]);
  const [possibleRecipients, setPossibleRecipients] = useState([]);
  const [recipientValid, setRecipientValid] = useState(null); // null: not checked, true: valid, false: invalid

  const handleRecipientChange = async (value) => {
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

    if (possibleRecipients.length > 0) {
      // Assuming `possibleRecipients` is a list of all displayNames
      const matches = possibleRecipients.filter((name) =>
        name.toLowerCase().includes(value.toLowerCase())
      );
      setPossibleMatches(matches);
      console.log('matches', matches);
      console.log('value', value);
      if (matches.includes(value)) {
        setRecipientValid(true);
      } else {
        setRecipientValid(false);
      }
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
      <div className="compose-modal-backdrop" onClick={onClose} />
      <div className="compose-modal">
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
              style={{ width: '100%' }}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message body"
              style={{ width: '100%', minHeight: '4em' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleSubmit} disabled={recipientValid !== true}>
                Send
              </button>
              <button onClick={onClose}>Close</button>
            </div>
        </div>
      </div>
    </>
  );
}
