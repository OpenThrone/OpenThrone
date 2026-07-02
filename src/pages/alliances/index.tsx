import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps = async (_context) => {
  return {
    redirect: {
      destination: '/alliances/browse',
      permanent: true,
    },
  };
};

/** Alliances index. */
export default function AlliancesIndex(
  _props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return null;
}
