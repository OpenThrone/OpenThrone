import type { GetServerSideProps } from 'next';

import { localePrefix } from '@/utils/localeRedirect';

const Armory = () => null;

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps: GetServerSideProps = async (context) => ({
  redirect: {
    destination: `${localePrefix(context.locale, context.defaultLocale)}/structures/armory/offense`,
    permanent: false,
  },
});

export default Armory;
