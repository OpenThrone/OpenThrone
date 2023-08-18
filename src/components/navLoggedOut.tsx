/* eslint-disable jsx-a11y/anchor-is-valid */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const parentLinks = [
  { title: 'Home', url: '/' },
  { title: 'Login', url: '/account/login' },
  { title: 'Signup', url: '/account/register' },
] as const;

export const NavLoggedOut: React.FC = () => {
  const router = useRouter();
  const [activeParentLink, setActiveParentLink] = useState<string>('');

  const [defaultParentLink, setDefaultParentLink] = useState<string>('/');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleParentClick = (event: React.MouseEvent, link: string) => {
    event.preventDefault();
    if (link === activeParentLink) {
      setActiveParentLink('');
    } else {
      setActiveParentLink(link);
    }
  };

  useEffect(() => {
    const currentPath = router.pathname;
    const activeLink = parentLinks.find((link) => link.url === currentPath);
    if (activeLink) {
      setActiveParentLink(activeLink.url);
      setDefaultParentLink(activeLink.url);
    } else {
      setActiveParentLink('');
    }
  }, [router.pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="block md:hidden"
      >
        {mobileMenuOpen ? 'Close' : 'Open'} Menu
      </button>
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
