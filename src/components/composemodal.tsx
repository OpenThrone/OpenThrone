// src/components/ComposeModal.tsx
import React from 'react';

import type { ComposeFormProps } from '@/types/typings';

import ComposeForm from './compose-form';

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
