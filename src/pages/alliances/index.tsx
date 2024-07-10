import { GetServerSideProps, InferGetServerSidePropsType } from 'next';

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    redirect: {
      destination: '/alliances/browse',
      permanent: true,
    },
  };
};

export default function AlliancesIndex(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return null;
}
