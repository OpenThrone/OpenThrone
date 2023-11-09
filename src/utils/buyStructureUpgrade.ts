// utils/buyStructureUpgrade.js
const buyUpgrade = async (currentPage, index, forceUpdate) => {
  const response = await fetch('/api/structures/upgrades', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currentPage,
      index
    }),
  });

  const data = await response.json();
  if (response.ok) {
    // Handle successful purchase
    forceUpdate();
  } else {
    // Handle errors
    console.error(data.message);
  }
};

export default buyUpgrade;