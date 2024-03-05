// src/components/ComposeModal.tsx
import React, { useState } from 'react';
import ComposeForm from './compose-form';

export default function ComposeModal({ onClose }) {
  
  return (
    <>
      <div className="compose-modal-backdrop" onClick={onClose} />
      <div className="compose-modal">
        <ComposeForm onClose={onClose} />
      </div>
    </>
  );
}
