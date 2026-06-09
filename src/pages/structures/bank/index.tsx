import type { GetServerSideProps } from 'next';

const BankIndex = () => null;

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/structures/bank/deposit',
    permanent: false,
  },
});

export default BankIndex;
