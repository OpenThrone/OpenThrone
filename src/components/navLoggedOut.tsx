import { Burger } from '@mantine/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const parentLinks = [
  { title: 'Home', url: '/' },
  { title: 'Login', url: '/account/login' },
  { title: 'Signup', url: '/account/register' },
  { title: 'News', url: '/community/news' },
] as const;

export const NavLoggedOut: React.FC = () => {
  const pathName = usePathname();
  const [activeParentLink, setActiveParentLink] = useState<string>('');

  const [, setDefaultParentLink] = useState<string>('/');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleParentClick = (event: React.MouseEvent, link: string) => {
    if (link === activeParentLink) {
      setActiveParentLink('');
    } else {
      setActiveParentLink(link);
    }
  };

  useEffect(() => {
    const currentPath = pathName;
    const activeLink = parentLinks.find((link) => link.url === currentPath);
    if (activeLink) {
      setActiveParentLink(activeLink.url);
      setDefaultParentLink(activeLink.url);
    } else {
      setActiveParentLink('');
    }
  }, [pathName]);

  return (
    <>
      <Burger className="block sm:hidden" opened={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}></Burger>
      
      <nav className={mobileMenuOpen ? 'block md:hidden' : 'hidden md:hidden'}>
        <ul className="text-center text-xl">
          {parentLinks.map((link) => (
            <div key={link.title}>
              <li className="mr-6">
                <Link
                  href={link.url}
                  className="border-none text-gray-700 hover:text-gray-900"
                  onClick={(event) => handleParentClick(event, link.url)}                  
                >
                  {link.title}
                </Link>
              </li>
            </div>
          ))}
        </ul>
      </nav>
      <div>
        <nav className="hidden bg-elf-menu-primary md:block">
          <div className="mx-auto max-w-screen-md md:block">
            <ul className="flex flex-wrap items-center justify-evenly text-center text-xl">
              {parentLinks.map((link) => (
                <li className="mr-6" key={link.title}>
                  <Link
                    href={link.url}
                    className={`border-none ${
                      activeParentLink === link.url
                        ? 'text-elf-link-current'
                        : 'text-elf-link-link'
                    } hover:text-elf-link-hover`}
                  >
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </>
  );
};
