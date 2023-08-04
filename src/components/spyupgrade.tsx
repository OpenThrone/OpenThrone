import UpgradeTable from './UpgradeTable';

const SpyUpgrade = ({ units }) => {
  return (
    <UpgradeTable
      heading="Defensive Fortifications"
      units={units}
      type="defense"
    />
  );
};

export default SpyUpgrade;
