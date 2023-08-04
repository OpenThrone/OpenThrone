import UpgradeTable from './UpgradeTable';

const OffenseUpgrade = ({ units }) => {
  return (
    <UpgradeTable
      heading="Defensive Fortifications"
      units={units}
      type="defense"
    />
  );
};

export default OffenseUpgrade;
