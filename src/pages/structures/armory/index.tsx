import type { GetServerSideProps } from 'next';

const Armory = () => null;

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/structures/armory/offense',
    permanent: false,
  },
});

export default Armory;
