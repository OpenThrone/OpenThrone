import type { GetStaticPaths, GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import GuideDocument, {
  GUIDE_SLUGS,
  type GuideSlug,
  isGuideSlug,
} from '@/components/public/GuideDocument';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function GuidePage({ slug }: { slug: GuideSlug }) {
  const { t } = useTranslation('guides');
  return (
    <MainArea title={t(`${slug}.title`)}>
      <GuideDocument slug={slug} />
    </MainArea>
  );
}

export const getStaticPaths: GetStaticPaths = async ({ locales = ['en'] }) => ({
  paths: locales.flatMap((locale) =>
    GUIDE_SLUGS.map((slug) => ({ params: { slug }, locale })),
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps = async ({ locale, params }) => {
  const slug = params?.slug;
  if (!isGuideSlug(slug)) return { notFound: true };
  return {
    props: {
      slug,
      ...(await serverSideTranslations(locale ?? 'en', [
        'common',
        'navigation',
        'guides',
        'structures',
      ])),
    },
  };
};
