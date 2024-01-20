import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import FortificationsTab from '@/components/fortification-upgrades';
import HousingTab from '@/components/housing-upgrades';
import EconomyTab from '@/components/economy-upgrades';
import OffenseUpgrade from '@/components/offenseupgrade';
import Alert from '@/components/alert';
import ArmoryUpgradesTab from '@/components/armory-upgrades';
import ClandestineUpgrade from '@/components/clandestineupgrades';

const UpgradeTab = () => {
  const tab = usePathname()?.split('/')[3];
  const { user, forceUpdate } = useUser();
  const currentPage = tab || 'fortifications';

  useEffect(() => {
    if (currentPage === 'fortifications') {
    }
  }, [currentPage]);

  return (
    <div className="mainArea pb-10">
      <h2>Structure Upgrades</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
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
          href='/structures/upgrades/offense'
          className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'offense' ? 'bg-blue-500 text-white' : ''
              }`}
            aria-current='page'>
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
          <Link
            href="/structures/upgrades/houses"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${tab === 'houses' ? 'bg-blue-500 text-white' : ''
              }`}
            aria-current="page"
          >
            Housing
          </Link>
          {<Link
            href="/structures/upgrades/economy"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${tab === 'economy' ? 'bg-blue-500 text-white' : ''
              }`}
          >
            Economy Upgrades
          </Link>}
          {<Link
            href="/structures/upgrades/armory"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${tab === 'armory' ? 'bg-blue-500 text-white' : ''
              }`}
          >
            Armory Upgrades
          </Link>}
        </div>
      </div>
      
      <div className="mb-4 flex justify-center">
        {currentPage === 'fortifications' && (<h2>Fortifications</h2>)}
        {currentPage === 'offense' && (<h2>Offense Upgrades</h2>)}
        {currentPage === 'intel' && (<h2>Clandestine Upgrades</h2>)}
        {currentPage === 'houses' && (<h2>Housing Upgrades</h2>)}
        {currentPage === 'economy' && (<h2>Economy Upgrades</h2>)}
      </div>
      <div className="mb-4 flex justify-center my-10 rounded-lg bg-gray-800">
        {currentPage === 'fortifications' && <FortificationsTab userLevel={user?.level} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} />}
        {currentPage === 'offense' && <OffenseUpgrade userLevel={user?.offensiveLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} />}
        {currentPage === 'houses' && <HousingTab userLevel={user?.houseLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} />}
        {currentPage === 'armory' && <ArmoryUpgradesTab userLevel={user?.armoryLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate}/> }
        {currentPage === 'economy' && <EconomyTab userLevel={user?.economyLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate}/>}
        {currentPage === 'intel' && <ClandestineUpgrade userLevel={user?.spyLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate}/>}
      </div>
    </div>
  );
};
export default UpgradeTab;
