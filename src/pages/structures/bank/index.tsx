import type { GetServerSideProps } from 'next';

const BankIndex = () => null;

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/structures/bank/deposit',
    permanent: false,
  },
});

export default BankIndex;
