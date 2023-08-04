import React from 'react';

type Unit = {
  id: string;
  name: string;
  enabled: boolean;
  levelRequirement?: number;
  defenseBonusPercentage?: number;
  costPerRepairPoint?: number;
  hitpoints?: number;
  goldPerTurn?: number;
  cost: number;
  offenseBonusPercentage?: number;
  bonus?: number;
  levelRequirementName?: {
    name: string;
  };
  owned?: boolean;
};

type Props = {
  heading: string;
  units: Unit[];
  type: 'defense' | 'offense' | 'spy' | 'sentry';
};

const UpgradeTable: React.FC<Props> = ({ heading, units, type }) => {
  const renderRow = (unit: Unit) => {
    switch (type) {
      case 'defense':
        return (
          <tr key={unit.id}>
            <td className="align-middle">{unit.name}</td>
            {/* ... (similar structure for other columns) */}
          </tr>
        );
      case 'offense':
        return (
          <tr key={unit.id}>
            <td className="align-middle">{unit.name}</td>
            {/* ... (similar structure for other columns) */}
          </tr>
        );
      case 'spy':
      case 'sentry':
        return (
          <tr key={unit.id}>
            <td className="align-middle">{unit.name}</td>
            {/* ... (similar structure for other columns) */}
          </tr>
        );
    }
  };

  return (
    <table className="table-dark table-striped table">
      {/* ... (thead definition based on type) */}
      <tbody>{units.map(renderRow)}</tbody>
    </table>
  );
};

export default UpgradeTable;
