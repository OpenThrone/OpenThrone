import UpgradeTable from './upgradetable';

const DefenseUpgrade = ({ units }) => {
  return (
    <UpgradeTable
      heading="Defensive Fortifications"
      units={units}
      type="defense"
    />
  );
};

export default DefenseUpgrade;
