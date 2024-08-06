import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

interface Breadcrumb {
  text: string;
  href: string;
}

interface BreadcrumbContextProps {
  breadcrumbs: Breadcrumb[];
}

const BreadcrumbContext = createContext<BreadcrumbContextProps>({ breadcrumbs: [] });

export const BreadcrumbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const router = useRouter();
  useEffect(() => {
    const cleanPath = router.asPath.split('?')[0]; // Remove query parameters
    const pathParts = cleanPath.split('/').filter(part => part);
    const newBreadcrumbs: Breadcrumb[] = [];

    pathParts.reduce((prevHref, part, index) => {
      const href = `${prevHref}/${part}`;
      newBreadcrumbs.push({
        text: part.charAt(0).toUpperCase() + part.slice(1),
        href,
      });
      return href;
    }, '');

    setBreadcrumbs([...newBreadcrumbs]);
  }, [router.asPath]);

  return (
    <BreadcrumbContext.Provider value={{ breadcrumbs }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumbs = () => useContext(BreadcrumbContext);
