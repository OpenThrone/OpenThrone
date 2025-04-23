import React, { useState } from 'react';

import { useLayout } from '../context/LayoutContext';
import router from 'next/router';
import { useUser } from '@/context/users';
import useSocket from '@/hooks/useSocket';

/**
 * Props for the attack confirmation Modal component.
 */
interface ModalProps {
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /** Function to toggle the modal's visibility. */
  toggleModal: () => void;
  /** The ID of the user profile being targeted for attack. */
  profileID?: number;
}

/**
 * A modal component used to confirm the number of attack turns before initiating an attack.
 * Handles form submission, API interaction, loading state, error display, and redirection to results.
 */
const Modal: React.FC<ModalProps> = ({ isOpen, toggleModal, profileID }) => {
  const [turns, setTurns] = useState(1);
  const {user, forceUpdate} = useUser();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const { socket } = useSocket(user?.id);

  /**
   * Handles the submission of the attack confirmation form.
   * Sends the attack request to the API, handles the response,
   * manages loading and error states, and redirects on success.
   * @param event - The form submission event.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!turns || isLoading) return; // Prevent multiple submissions

    setIsLoading(true); // Set loading state
    setError(''); // Clear previous errors

    const res = await fetch(`/api/attack/${profileID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ turns }),
    });

    const results = await res.json();

    if (results.status === 'failed') {
      setError(`Failed to execute attack. ${results?.message}`);
      setIsLoading(false); // Reset loading state on failure
    } else {
      // No need to set error here as it's cleared at the start
      forceUpdate();
      if (socket) {
        socket.emit('notifyAttack', { defenderId: profileID, battleId: results.attack_log });
      }
      router.push(`/battle/results/${results.attack_log}`);
      // No need to toggle modal here, let the redirect handle it
      // Reset loading state on success (though redirect might make this visually brief)
      setIsLoading(false);
    }
  };

  const { raceClasses } = useLayout();
  return (
    <div
      className={`fixed inset-0 z-10 overflow-y-auto bg-gray-500 bg-opacity-75 transition-opacity ${
        isOpen ? '' : 'hidden'
      }`}
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex min-h-screen  items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
        <span
          className="hidden sm:inline-block sm:h-screen sm:align-middle"
          aria-hidden="true"
        >
          &#8203;
        </span>
        <div className="inline-block overflow-hidden text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <div
            className={`rounded-md px-4 pb-4 pt-5 sm:p-6 sm:pb-4 ${raceClasses.bgClass}`}
          >
            <div className="justify-between sm:flex sm:items-center">
              <h3 className="text-lg font-medium leading-6" id="modal-title">
                How many turns?
              </h3>
              <button
                onClick={toggleModal}
                type="button"
                className="ml-3 inline-flex rounded-md border border-transparent bg-red-600 p-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 sm:text-sm"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="size-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {error && <p className="text-red-500">{error}</p>}
            <form onSubmit={handleSubmit}>
              <div className="mt-2">
                <input
                  type="number"
                  min="1"
                  placeholder="1"
                  value={turns}
                  onChange={(e) => setTurns(parseInt(e.target.value, 10) || 0)} // Parse value to integer
                  className="block w-full rounded-md border-gray-300 bg-black p-2.5 leading-6 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
              <div className="mt-4">
                <button
                  type="submit"
                  className={`inline-flex w-full justify-center rounded-md border border-transparent px-4 py-2 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:text-sm ${
                    isLoading
                      ? 'cursor-not-allowed bg-indigo-400'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  disabled={isLoading} // Disable button when loading
                >
                  {isLoading ? 'Submitting...' : 'Submit'} {/* Change text when loading */}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
