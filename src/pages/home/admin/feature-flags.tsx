import type { GetServerSideProps } from 'next';

/**
 * Feature switches now live only in Server Settings (they used to be stored
 * twice, and a flag here silently overrode the setting). Old links redirect.
 */
export const getServerSideProps: GetServerSideProps = async (context) => ({
  redirect: {
    destination: `${context.locale && context.locale !== context.defaultLocale ? `/${context.locale}` : ''}/home/admin/settings`,
    permanent: false,
  },
});

const FeatureFlagsRedirect = () => null;

export default FeatureFlagsRedirect;
