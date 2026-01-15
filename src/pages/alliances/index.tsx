import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';

export const getServerSideProps: GetServerSideProps = async (_context) => {
  return {
    redirect: {
      destination: '/alliances/browse',
      permanent: true,
    },
  };
};

export default function AlliancesIndex(
  _props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return null;
}
