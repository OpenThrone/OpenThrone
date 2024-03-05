// src/components/ComposeModal.tsx
import React, { useState } from 'react';
import ComposeForm from './compose-form';
import { ComposeFormProps } from '@/types/typings';

export default function ComposeModal({ onClose }: ComposeFormProps) {
  
  return (
    <>
      <div className="compose-modal-backdrop" onClick={onClose} />
      <div className="compose-modal">
        <ComposeForm onClose={onClose} />
      </div>
    </>
  );
}
