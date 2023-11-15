import { raceClasses } from '@/context/LayoutContext';
import React, { useState } from 'react';
const Modal = ({ isOpen, children, toggleModal }) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-10 overflow-y-auto bg-gray-500 bg-opacity-75 transition-opacity ${isOpen ? '' : 'hidden'
      }`}>
      <div className="flex min-h-screen  items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
        <span
          className="hidden sm:inline-block sm:h-screen sm:align-middle"
          aria-hidden="true"
        >
          &#8203;
        </span>
        <div className="inline-block overflow-hidden text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <div
            className={`px-4 pb-4 pt-5 sm:p-6 sm:pb-4 rounded-md ${raceClasses.bgClass}`}
          >
            <div className="justify-between sm:flex sm:items-center">
              <h3
                className="text-lg font-medium leading-6"
                id="modal-title"
              >Spy Mission</h3>
              <button
                onClick={toggleModal}
                type="button"
                className="ml-3 inline-flex rounded-md border border-transparent bg-red-600 p-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 sm:text-sm"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="h-6 w-6"
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
            {children}
        </div>
        </div>
        </div>
    </div>
  );
};

const SpyMissionsModal = ({ isOpen, toggleModal }) => {
  const [currentPanel, setCurrentPanel] = useState(null);

  const MissionPanels = {
    'intelligence': (
      <div>
        <h3>Intelligence Gathering</h3>
        <p>Limit output to a % based on (spies / 10).</p>
      </div>
    ),
    'assassination': (
      <div>
        <h3>Assassination</h3>
        <p>20 Spies per 24h - Upgradable. Murder Trained Units.</p>
      </div>
    ),
    'infiltration': (
      <div>
        <h3>Infiltration</h3>
        <p>Damage Fort. 3 Spies per 24h - Upgradable.</p>
      </div>
    )
  };

  return (
    <Modal isOpen={isOpen} toggleModal={toggleModal}>
      {!currentPanel ? (
        <div className='text-left'>
          <button type='button' onClick={() => setCurrentPanel('intelligence')}><h2 className="text-left">Intelligence Gathering</h2><span className="text-left">Send up to 10 Spies to collect Intel</span></button><br/>
          <button type='button' onClick={() => setCurrentPanel('assassination')}><h2 className="text-left">Assassination</h2><span className="text-left">Attempt to assassinate player's Defenders</span></button><br />
          <button type='button' onClick={() => setCurrentPanel('infiltration')}><h2 className="text-left">Infiltration</h2><span className="text-left">Infiltrate and Destroy the Fort</span></button><br />
        </div>
      ) : (
        <>
          <button onClick={() => setCurrentPanel(null)}>Back</button>
          {MissionPanels[currentPanel]}
        </>
      )}
    </Modal>
  );
};

export default SpyMissionsModal;
