import { Meta } from '@storybook/react';
import { useState } from 'react';

import DefenseUpgrade from '@/components/defenseupgrade';
import Layout from '@/components/Layout';

const Upgrades = () => {
  // Sample state for dynamic values (will be replaced with actual data fetching later)
  const [userData, setUserData] = useState({
    citizens: 0,
    gold: 0,
    goldInBank: 0,
    units: {
      offense: 0,
      defense: 0,
      spies: 0,
      sentries: 0,
    },
  });

  const defenseUnits = [{ enabled: false, id: 0, name: 'som' }];

  // Placeholder function for handling upgrade submission (to be expanded)
  const handleUpgradeSubmit = (type) => {
    // API call logic will go here
    console.log(`Upgrading ${type}`);
  };

  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
      <div className="mainArea pb-10">
        <h2>Structure Upgrades</h2>
        <div
          className="d-flex justify-content-around my-5"
          id="alertMSG"
          style={{ display: 'none' }}
        >
          {/* Alert messages will go here */}
        </div>

        <div className="d-flex justify-content-around my-5">
          <p>
            Untrained Citizens: <span>{userData.citizens}</span>
          </p>
          {/* ... (similar structure for other data points) */}
        </div>

        <form className="mb-5">
          <h3>Defense</h3>
          <DefenseUpgrade units={defenseUnits} />
          <button onClick={() => handleUpgradeSubmit('defense')}>
            Upgrade Defense
          </button>
        </form>
      </div>
    </Layout>
  );
};

export default Upgrades;
