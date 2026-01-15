import type { GetServerSideProps } from 'next';

const UpgradesIndex = () => null;

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/structures/upgrades/fortifications',
    permanent: false,
  },
});

export default UpgradesIndex;
