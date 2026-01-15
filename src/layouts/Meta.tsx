import { NextSeo } from 'next-seo';

import type { IMetaProps } from '@/types/typings';
import { AppConfig } from '@/utils/AppConfig';

const Meta = (props: IMetaProps) => {
  return (
    <NextSeo
      title={props.title}
      description={props.description}
      canonical={props.canonical}
      openGraph={{
        title: props.title,
        description: props.description,
        url: props.canonical,
        locale: AppConfig.locale,
        site_name: AppConfig.site_name,
      }}
    />
  );
};

export { Meta };
