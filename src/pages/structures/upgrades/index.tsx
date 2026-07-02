import type { GetServerSideProps } from 'next';

const UpgradesIndex = () => null;

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/structures/upgrades/fortifications',
    permanent: false,
  },
});

export default UpgradesIndex;
