import { alertService } from '@/services/Alert.service';

import { logError } from './logger';

const purchase = async (
  currentPage: string,
  index: number,
  forceUpdate: () => void,
) => {
  const response = await fetch('/api/structures/upgrades', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currentPage,
      index,
    }),
  });

  const data = await response.json();
  if (response.ok) {
    // Handle successful purchase
    forceUpdate();
    alertService.success(data.message);
  } else {
    // Handle errors
    logError('Error Buying Upgrade', data.error);
    alertService.error(data?.error);
  }
};

// One purchase at a time: a double-click must not buy twice.
let inFlight = false;

const buyUpgrade = async (
  currentPage: string,
  index: number,
  forceUpdate: () => void,
) => {
  if (inFlight) return;
  inFlight = true;
  try {
    await purchase(currentPage, index, forceUpdate);
  } finally {
    inFlight = false;
  }
};

export default buyUpgrade;
