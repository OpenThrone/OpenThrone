import type { FC } from 'react';
import React, { useEffect, useState } from 'react';
import { faBackwardStep} from '@fortawesome/free-solid-svg-icons';
import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import { alertService } from '@/services';

import Alert from './alert';
import router from 'next/router';
import { stringifyObj } from '@/utils/numberFormatting';
import { Button, NumberInput } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

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
        <div className="inline-block overflow-hidden text-left align-bottom shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle bg-white rounded-lg">
          <div
            className={`rounded-t-lg px-4 pt-5 pb-4 sm:p-6 sm:pb-4 ${layoutCont.raceClasses.bgClass}`}
          >
            <div className="justify-between flex items-center">
              <h2 className="text-xl font-semibold leading-6" id="modal-title">
                Spy Mission
              </h2>
              <button
                onClick={toggleModal}
                type="button"
                className="rounded-md p-2 inline-flex items-center justify-center text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
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
    className={`my-2 w-full rounded-md px-4 py-2 text-lg font-bold ${
      disabled
        ? 'cursor-not-allowed bg-gray-900 text-gray-700'
      : 'cursor-pointer bg-gray-800 hover:bg-gray-600 text-white'
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
  const handleIntelGathering = async () => {
    if (intelSpies > 10) {
      alertService.error(
        'You can only send a maximum of 10 spies per mission.',
        false
      );
      return;
    }
    const res = await fetch(`/api/spy/${defenderID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'INTEL', spies: intelSpies }),
    });
    const results = await res.json();

    if (results.status === 'failed') {
      alertService.error(results.status);
    } else {
      router.push(`/battle/results/${results.attack_log}`);
      toggleModal();
    }
    alertService.success(
      `You have sent ${intelSpies} spies to gather intelligence.`
    );
  };
  
  const handleAssassination = async () => {
    if(intelSpies > 5) {
      alertService.error(
        'You can only send a maximum of 5 assassins per mission.',
        false
      );
      return;
    }
    const res = await fetch(`/api/spy/${defenderID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'ASSASSINATE', spies: intelSpies, unit: assassinateUnit}),
    });
    const results = await res.json();

    if (results.status === 'failed') {
      alertService.error(results.status);
    } else {
      console.log('log id: ',results.attack_log)
      router.push(`/battle/results/${results.attack_log}`);
      toggleModal();
    }
    alertService.success(
      `You have sent ${intelSpies} spies to assassinate ${assassinateUnit}.`
    );
  };
  /*const handleInfiltration = () => {
    console.log('infiltration');
  };
  */
  const MissionPanels: Record<MissionPanelKey, JSX.Element> = {
    intelligence: (
      <div className="px-4 py-5 sm:p-6 shadow-xl rounded-lg">
        <h2 className="text-center text-lg font-semibold mb-4">Intelligence Gathering</h2>
        How many spies would you like to send? <br />
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <NumberInput
              className="mt-2 mb-4 w-full sm:w-1/2 rounded-md bg-gray-700 p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              max={5}
              min={1}
              value={intelSpies || 0}
              allowNegative={false}
              allowDecimal={false}
              allowLeadingZeros={false}
              onChange={(e) => setIntelSpies(Number(e))}
            />
            <span className="ml-2 text-white">/ 10</span>
          </div>
          <button
            type="button"
            onClick={handleIntelGathering}
            className="rounded bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Send Spies
          </button>
        </div>
        <div className="mt-4">
          <h2 className="text-center text-lg font-semibold">Intelligence Information</h2>
          <p className="mt-2">Spies Trained: {units.SPY}</p>
          <span className="block mt-1">You can send a maximum of 10 spies per mission.</span>
        </div>
      </div>
    ),
    assassination: (
      <div className='px-4 py-5 sm:p-6'>
        <h2 className="text-center text-lg font-medium mb-4">Assassination</h2>
        What type of units would you like to assassinate?
        <br />
        <select
          value={assassinateUnit}
          onChange={(e) => setAssassinateUnit(e.target.value)}
          className="mt-2 mb-4 w-full rounded-md bg-gray-700 p-2 text-white"
        >
          {['CITIZEN/WORKERS', 'OFFENSE', 'DEFENSE'].map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </select>
        <br />
        How many assassins would you like to send?
        <br />
        <NumberInput
          className="mt-2 mb-4 w-1/2 rounded-md bg-gray-700 p-2 text-white"
          max={5}
          min={1}
          value={intelSpies || 0}
          allowNegative={false}
          allowDecimal={false}
          allowLeadingZeros={false}
          onChange={(e) => setIntelSpies(Number(e))}
        />{' '}
        / 5<br />
        <button
          onClick={handleAssassination}
          type="button"
          className="w-full rounded bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 transition-colors"
        >
          Assassinate
        </button>
        <br />
        <div className="mt-4">
          <h2 className="text-center text-lg font-medium">Assassination Information</h2>
          <p className="mt-2">Total Assassins: </p>
        <span>You can send a maximum of 5 assassins per mission.</span>
        <br />
          <p className="mt-2">Assassination Attempts Available: ##</p>
        <span>
          You can only send 1 assassination attempt per 24 hours.
          <br />
          To increase the number of attempts per day, upgrade your spy
          structure!
          </span>
        </div>
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
                <small className="text-white"> Requires Fort: ###</small>
              </b>
            )}
          </CustomButton>
        </div>
      ) : (
        <>
            <Button leftSection={< FontAwesomeIcon icon={ faBackwardStep} size={'1x'} />} onClick={() => setCurrentPanel('')}>
            Back
          </Button>
          {MissionPanels[currentPanel]}
        </>
      )}
    </Modal>
  );
};

export default SpyMissionsModal;
