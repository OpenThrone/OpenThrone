import type { GetServerSideProps } from 'next';

const Armory = () => null;

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/structures/armory/offense',
    permanent: false,
  },
});

export default Armory;
