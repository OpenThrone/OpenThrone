import { alertService } from '@/services';
import { logError } from './logger';

// utils/buyStructureUpgrade.js
const buyUpgrade = async (currentPage: string, index: number, forceUpdate: () => void) => {
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
    logError("Error Buying Upgrade", data.error);
    alertService.error(data?.error);
  }
};

export default buyUpgrade;
