import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';

const Bank = () => {
  const router = useRouter();
  const { tab } = router.query;
  const { user, forceUpdate } = useUser();
  const [depositAmount, setDepositAmount] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [bankHistory, setBankHistory] = useState([]);
  const currentPage = tab || 'deposit';
  useEffect(() => {
    if (currentPage === 'history') {
      fetch('/api/bank/history')
        .then((response) => response.json())
        .then((data) => setBankHistory(data))
        .catch((error) => console.error('Error fetching bank history:', error));
    }
  }, [currentPage]);

  const citizenUnit = user?.units.find((u) => u.type === 'WORKER');

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
          Gold On Hand: <span>{parseInt(user?.gold).toLocaleString()}</span>
        </p>
        <p className="mb-0">
          Banked Gold:{' '}
          <span>{parseInt(user?.goldInBank).toLocaleString()}</span>
        </p>
      </div>
      <div className="mb-4 flex justify-center">
        <div className="flex space-x-2">
          <Link
            href="/structures/bank/deposit"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'deposit' ? 'bg-blue-500 text-white' : ''
            }`}
            aria-current="page"
          >
            Deposit
          </Link>
          <Link
            href="/structures/bank/history"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'history' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Bank History
          </Link>
          <Link
            href="/structures/bank/economy"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'economy' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Economy
          </Link>
        </div>
      </div>

      {tab === 'deposit' && (
        <>
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
              <button
                type="submit"
                className="bg-blue-500 px-4 py-2 text-white"
              >
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
              <button
                type="submit"
                className="bg-blue-500 px-4 py-2 text-white"
              >
                Withdraw
              </button>
            </div>
          </form>
        </>
      )}

      {currentPage === 'history' && (
        <div>
          <h3>Bank History</h3>
          <table className="min-w-full border-neutral-500">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {bankHistory.map((entry, index) => {
                let transactionType = '';

                if (entry.from_user_id === entry.to_user_id) {
                  transactionType =
                    entry.from_user_account_type === 'HAND'
                      ? 'Deposit'
                      : 'Withdraw';
                } else if (entry.history_type === 'PLAYER_TRANSFER') {
                  transactionType = 'Player Transfer';
                }

                return (
                  <tr key={index}>
                    <td>{new Date(entry.date_time).toLocaleDateString()}</td>
                    <td>{transactionType}</td>
                    <td>{entry.gold_amount} gold</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'economy' && (
        <div className="flex space-x-8">
          {/* Workers Card */}
          <div className="w-1/2 rounded-lg  p-6 shadow-md">
            <h3 className="mb-4 text-xl font-semibold">Workers</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <strong>Total Workers:</strong>
                <span>{citizenUnit?.quantity || 0}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                <p>To increase your workforce, visit the training page.</p>
              </div>
              <div className="flex justify-between">
                <strong>Gold Per Worker:</strong>
                <span>{citizenUnit?.bonus} gold/turn</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                <p>
                  To increase your gold per worker, upgrade your economy
                  structure.
                </p>
              </div>
            </div>
          </div>

          {/* Operations Card */}
          <div className="w-1/2 rounded-lg  p-6 shadow-md">
            <h3 className="mb-4 text-xl font-semibold">Operations</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <strong>Current Economy Upgrade:</strong>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                This Upgrade will increase bank deposits or gold per worker
              </div>
              <div className="flex justify-between">
                <strong>Fortification Gold Per Turn:</strong>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                As the fortification is upgraded, the fortification gold per
                turn will increase
              </div>
              <div className="flex justify-between">
                <strong>Worker Gold Per Turn:</strong>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                Increase this number by training more workers and upgrading your
                economy
              </div>
              <div className="flex justify-between">
                <strong>Total Gold Per Turn:</strong>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                This includes workers, fort gold, and any additional wealth
                bonus
              </div>
              <div className="flex justify-between">
                <strong>Daily Income:</strong>
                {/* You can compute and display the daily income here */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bank;
