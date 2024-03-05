import { NextSeo } from 'next-seo';

import { AppConfig } from '@/utils/AppConfig';
import { IMetaProps } from '@/types/typings';

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
