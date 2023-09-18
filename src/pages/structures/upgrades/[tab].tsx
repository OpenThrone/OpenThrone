import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { useUser } from '@/context/users';

const UpgradeTab = () => {
  const router = useRouter();
  const { tab } = router.query;
  const { user, forceUpdate } = useUser();
  const currentPage = tab || 'fortifications';

  useEffect(() => {
    if (currentPage === 'fortifications') {
    }
  }, [currentPage]);
  return (
    <div className="mainArea pb-10">
      <h2>Structure Upgrades</h2>
      <div className="mb-4 flex justify-center">
        <div className="flex space-x-2">
          <Link
            href="/structures/upgrades/fortifications"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'fortifications' ? 'bg-blue-500 text-white' : ''
            }`}
            aria-current="page"
          >
            Fortifcations
          </Link>
          <Link
            href="/structures/upgrades/mining"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'mining' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Mining Upgrades
          </Link>
          <Link
            href="/structures/upgrades/siege"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'siege' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Siege Upgrades
          </Link>
          <Link
            href="/structures/upgrades/intel"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'intel' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Clandestine Upgrades
          </Link>
        </div>
      </div>
      <div className="mb-4 flex justify-center">
        {tab === 'fortifications' && <>Fortifications</>}
        {tab === 'mining' && <>Mining Upgrades</>}
        {tab === 'siege' && <>Siege Upgrades</>}
        {tab === 'intel' && <>Clandestine Upgrades</>}
      </div>
    </div>
  );
};
export default UpgradeTab;
