import { Breadcrumbs, Anchor, Text, Divider } from '@mantine/core';
import { ReactNode } from 'react';
import { useBreadcrumbs } from '@/context/BreadcrumbContext';
//import styles from './pageTemplate.module.css'; // Import the CSS module

interface PageTemplateProps {
  title: string;
  children: ReactNode;
}

const PageTemplate = ({ title, children }: PageTemplateProps) => {
  const { breadcrumbs } = useBreadcrumbs();

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">{title}</h2>
      <Breadcrumbs className="text-center mt-4">
        {breadcrumbs.map((breadcrumb, index) => (
          <Anchor href={breadcrumb.href} key={index}>
            {breadcrumb.text}
          </Anchor>
        ))}
      </Breadcrumbs>
      <Divider mt={'sm'} mb={'sm'} />
      <div>
        {children}
      </div>
    </div>
  );
};

export default PageTemplate;
