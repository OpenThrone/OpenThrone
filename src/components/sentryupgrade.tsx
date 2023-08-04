import UpgradeTable from './UpgradeTable';

const SentryUpgrade = ({ units }) => {
  return (
    <UpgradeTable heading="Sentry Fortifications" units={units} type="sentry" />
  );
};

export default SentryUpgrade;
