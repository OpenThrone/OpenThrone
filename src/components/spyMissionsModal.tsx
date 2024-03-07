import type { FC } from 'react';
import React, { useEffect, useState } from 'react';

import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import { alertService } from '@/services';

import Alert from './alert';

interface ModalProps {
  isOpen: boolean;
  toggleModal: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, children, toggleModal }) => {
  const layoutCont = useLayout();
  if (!isOpen) return null;
  return (
    <div
      className={`fixed inset-0 z-10 overflow-y-auto bg-gray-500 bg-opacity-75 transition-opacity ${
        isOpen ? '' : 'hidden'
      }`}
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
            className={`rounded-md px-4 pb-4 pt-5 sm:p-6 sm:pb-4 ${layoutCont.raceClasses.bgClass}`}
          >
            <div className="justify-between sm:flex sm:items-center">
              <h2 className="font-medium leading-6" id="modal-title">
                Spy Mission
              </h2>
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
            <Alert />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CustomButtonProps {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const CustomButton: FC<CustomButtonProps> = ({
  onClick,
  disabled,
  children,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    type="button"
    className={`my-2 w-full rounded-md px-4 py-2 text-lg font-bold text-white ${
      disabled
        ? 'cursor-not-allowed bg-gray-400'
        : 'cursor-pointer bg-gray-800 hover:bg-gray-600'
    }`}
  >
    {children}
  </button>
);

interface SpyMissionProps {
  isOpen: boolean;
  toggleModal: () => void;
  defenderID: number;
}

type MissionPanelKey = 'intelligence' | 'assassination' | 'infiltration';

const SpyMissionsModal: FC<SpyMissionProps> = ({
  isOpen,
  toggleModal,
  defenderID,
}) => {
  const [currentPanel, setCurrentPanel] = useState<MissionPanelKey | ''>('');
  const [intelSpies, setIntelSpies] = useState(1);
  const [assassinateUnit, setAssassinateUnit] = useState('CITIZEN/WORKERS');

  // const [assassinateAmount, setAssassinateAmount] = useState(1);
  const [isAssassinateDisabled, setIsAssassinateDisabled] = useState(false);
  const [isInfiltrationDisabled, setIsInfiltrationDisabled] = useState(true);
  const [isIntelDisabled, setIsIntelDisabled] = useState(false);
  const { user } = useUser();
  const [units, setUnits] = useState({ SPY: 0, ASSASSIN: 0, INFILTRATOR: 0 });
  useEffect(() => {
    if (user) {
      // TODO, set this correctly
      if (user.level >= 15) setIsInfiltrationDisabled(false);
      if (user.level >= 10) setIsAssassinateDisabled(false);
      if (user.level >= 5) setIsIntelDisabled(false);
      setUnits({
        SPY:
          user.units.find((unit) => unit.type === 'SPY' && unit.level === 1)
            ?.quantity ?? 0,
        ASSASSIN:
          user.units.find((unit) => unit.type === 'SPY' && unit.level === 3)
            ?.quantity ?? 0,
        INFILTRATOR:
          user.units.find((unit) => unit.type === 'SPY' && unit.level === 2)
            ?.quantity ?? 0,
      });
    }
  }, [user]);
  const handleIntelGathering = () => {
    if (intelSpies > 10) {
      alertService.error(
        'You can only send a maximum of 10 spies per mission.',
        false
      );
      return;
    }
    fetch(`/api/spy/${defenderID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'INTEL', spies: intelSpies }),
    });
    alertService.success(
      `You have sent ${intelSpies} spies to gather intelligence.`
    );
  };
  /*
  const handleAssassination = () => {
    console.log('assassination');
  };
  const handleInfiltration = () => {
    console.log('infiltration');
  };
  */
  const MissionPanels: Record<MissionPanelKey, JSX.Element> = {
    intelligence: (
      <div>
        <h2 className="text-center">Intelligence Gathering</h2>
        How many spies would you like to send? <br />
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              type="number"
              className="w-25 rounded-md bg-gray-600 p-2"
              max={10}
              min={1}
              onChange={(e) => setIntelSpies(parseInt(e.target.value, 10))}
              value={intelSpies}
            />
            <span className="ml-1">/ 10</span>
          </div>
          <button
            type="button"
            onClick={handleIntelGathering}
            className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          >
            Send Spies
          </button>
        </div>
        <h2 className="text-center">Intelligence Information</h2>
        <p>Spies Trained: {units.SPY}</p>
        <span>You can send a maximum of 10 spies per mission.</span>
      </div>
    ),
    assassination: (
      <div>
        <h2 className="text-center">Assassination</h2>
        What type of units would you like to assassinate?
        <br />
        <select
          value={assassinateUnit}
          onChange={(e) => setAssassinateUnit(e.target.value)}
          className="w-25 rounded-md bg-gray-600 p-2"
        >
          {['CITIZEN/WORKERS', 'OFFENSE', 'DEFENSE'].map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </select>
        <br />
        How many assassins would you like to send?
        <br />
        <input
          type="number"
          className="w-10 rounded-md bg-gray-600 p-2"
          max={5}
          min={1}
        />{' '}
        / 5<br />
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
        >
          Assassinate
        </button>
        <br />
        <h2 className="text-center">Assassination Information</h2>
        <p>Total Assassins: </p>
        <span>You can send a maximum of 5 assassins per mission.</span>
        <br />
        <p>Assassination Attempts Available: ##</p>
        <span>
          You can only send 1 assassination attempt per 24 hours.
          <br />
          To increase the number of attempts per day, upgrade your spy
          structure!
        </span>
      </div>
    ),
    infiltration: (
      <div>
        <h3>Infiltration</h3>
        <p>Damage Fort. 3 Spies per 24h - Upgradable.</p>
      </div>
    ),
  };

  return (
    <Modal isOpen={isOpen} toggleModal={toggleModal}>
      {!currentPanel ? (
        <div className="text-left">
          <CustomButton
            onClick={() => setCurrentPanel('intelligence')}
            disabled={isIntelDisabled}
          >
            <span>🔍 Intelligence Gathering</span>
            <br />
            <small>Send up to 10 Spies to collect Intel</small>
          </CustomButton>
          <CustomButton
            onClick={() => setCurrentPanel('assassination')}
            disabled={isAssassinateDisabled}
          >
            <span>🗡️ Assassination</span>
            <br />
            <small>Attempt to assassinate player&apos;s Defenders</small>
            <br />
            {isAssassinateDisabled && (
              <b>
                <small className="text-black"> Requires Fort: ###</small>
              </b>
            )}
          </CustomButton>
          <CustomButton
            onClick={() => setCurrentPanel('infiltration')}
            disabled={isInfiltrationDisabled}
          >
            <span>🚧 Infiltration</span>
            <br />
            <small>Infiltrate and Destroy the Fort</small>
            <br />
            {isInfiltrationDisabled && (
              <b>
                <small className="text-black"> Requires Fort: ###</small>
              </b>
            )}
          </CustomButton>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setCurrentPanel('')}>
            Back
          </button>
          {MissionPanels[currentPanel]}
        </>
      )}
    </Modal>
  );
};

export default SpyMissionsModal;
