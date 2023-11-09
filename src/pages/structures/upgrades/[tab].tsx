import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import { EconomyUpgrades, Fortifications, HouseUpgrades, OffenseiveUpgrades, SpyUpgrades} from '@/constants';
import FortificationsTab from '@/components/fortification-upgrades';
import HousingTab from '@/components/housing-upgrades';
import EconomyTab from '@/components/economy-upgrades';

const UpgradeTab = () => {
  const router = useRouter();
  const { tab } = router.query;
  const { user, forceUpdate } = useUser();
  const currentPage = tab || 'fortifications';

  useEffect(() => {
    if (currentPage === 'fortifications') {
    }
  }, [currentPage]);

  const renderTable = (data, userLevel) => {
    return (
      <>
        <br />
        <table className="w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Level</th>
              <th>Cost</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(data)
              .filter(
                (item) =>
                  (item.level || item.fortLevel) <= userLevel + 2
              )
              .map((item, index) => (
                <tr key={index}>
                  <td>{item.name} {(item.level || item.fortLevel) === userLevel && ("(Current Upgrade)")}</td>
                  <td>{(currentPage === "economy" ? index : (item.level || item.fortLevel))}</td>
                  <td>{item.cost}</td>
                  <td>
                    {((item.level || item.fortLevel) === userLevel + 1 || (currentPage == 'economy' && index === userLevel + 1)) && (
                      <button type="button" className={"bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"} onClick={() => buyUpgrade(currentPage, index, forceUpdate)}>Buy</button>
                    )}
                    {(item.level || item.fortLevel) === userLevel + 2 && (
                      <span>Unlock at level {userLevel + 1}</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
          </table>
        </>
    );
  };

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
            href="/structures/upgrades/houses"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${tab === 'houses' ? 'bg-blue-500 text-white' : ''
              }`}
            aria-current="page"
          >
            Housing
          </Link>
          {<Link
            href="/structures/upgrades/economy"
            className={`border border-blue-500 px-4 py-2 hover:bg-blue-500 hover:text-white ${
              tab === 'economy' ? 'bg-blue-500 text-white' : ''
            }`}
          >
            Economy Upgrades
          </Link>}
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
        {currentPage === 'fortifications' && (<h2>Fortifications</h2>)}
        {currentPage === 'houses' && (<h2>Housing Upgrades</h2>)}
        {currentPage === 'economy' && (<h2>Economy Upgrades</h2>)}
        {currentPage === 'siege' && (<h2>Siege Upgrades</h2>)}
        {currentPage === 'intel' && (<h2>Clandestine Upgrades</h2>)}
      </div>
      <div className="mb-4 flex justify-center">
        {currentPage === 'fortifications' && <FortificationsTab userLevel={user?.level} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} />}
        {currentPage === 'houses' && <HousingTab userLevel={user?.houseLevel} forceUpdate={forceUpdate} /> }

        {currentPage === 'economy' && <EconomyTab userLevel={user?.economyLevel} forceUpdate={forceUpdate}/>}
        {currentPage === 'siege' && renderTable(OffenseiveUpgrades, user?.siegeLevel)}
        {currentPage === 'intel' && renderTable(SpyUpgrades, user?.intelLevel)}
      </div>
    </div>
  );
};
export default UpgradeTab;
