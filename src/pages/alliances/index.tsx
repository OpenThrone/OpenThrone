import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';

import { localePrefix } from '@/utils/localeRedirect';

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    redirect: {
      destination: `${localePrefix(context.locale, context.defaultLocale)}/alliances/browse`,
      // Never permanent: the destination embeds the request locale, and a
      // cached 308 would pin players to one language indefinitely.
      permanent: false,
    },
  };
};

/** Alliances index. */
export default function AlliancesIndex(
  _props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return null;
}
