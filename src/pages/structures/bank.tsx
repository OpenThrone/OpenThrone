import React, { useState } from 'react';

import { useUser } from '@/context/users';

const Bank = () => {
  const { user, forceUpdate } = useUser();
  const [depositAmount, setDepositAmount] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const currentPage = 'deposit';

  const handleDeposit = async () => {
    try {
      const response = await fetch('/api/bank/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ depositAmount }),
      });

      const data = await response.json();

      if (data.error) {
        // Handle error
      } else {
        // Update the user context or fetch new data
        forceUpdate();
        console.log(user);
      }
    } catch (error) {
      console.error('Error depositing:', error);
    }
  };
  const handleWithdraw = async () => {
    try {
      const response = await fetch('/api/bank/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ withdrawAmount }),
      });

      const data = await response.json();

      if (data.error) {
        // Handle error
      } else {
        // Update the user context or fetch new data
        forceUpdate();
        console.log(user);
      }
    } catch (error) {
      console.error('Error depositing:', error);
    }
  };
  return (
    <div className="mainArea pb-10">
      <h2>Bank</h2>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Gold On Hand: <span>{user?.gold}</span>
        </p>
        <p className="mb-0">
          Banked Gold: <span>{user?.goldInBank}</span>
        </p>
      </div>
      <div className="mb-4 flex justify-center">
        <div className="flex space-x-2">
          <a
            href="/bank/deposit"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              currentPage === 'deposit' ? 'bg-blue-500 text-white' : ''
            }`}
            aria-current="page"
          >
            Deposit
          </a>
          <a
            href="#"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              currentPage === 'history' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Bank History
          </a>
          <a
            href="#"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              currentPage === 'economy' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Economy
          </a>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleDeposit();
        }}
        className="flex items-end space-x-2"
      >
        <div className="grow">
          <label htmlFor="depositAmount" className="mb-2 block">
            Amount to Deposit
          </label>
          <input
            type="number"
            name="depositAmount"
            id="depositAmount"
            className="w-full border p-2"
            min="0"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
        </div>
        <div>
          <button type="submit" className="bg-blue-500 px-4 py-2 text-white">
            Deposit
          </button>
        </div>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleWithdraw();
        }}
        className="flex items-end space-x-2"
      >
        <div className="grow">
          <label htmlFor="withdrawAmount" className="mb-2 block">
            Amount to Withdraw
          </label>
          <input
            type="number"
            name="withdrawAmount"
            id="withdrawAmount"
            className="w-full border p-2"
            min="0"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
        </div>
        <div>
          <button type="submit" className="bg-blue-500 px-4 py-2 text-white">
            Withdraw
          </button>
        </div>
      </form>
    </div>
  );
};

export default Bank;
