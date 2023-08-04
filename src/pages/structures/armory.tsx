import { useEffect, useState } from 'react';

import ItemSection from '@/components/itemsection'; // Assuming you have a similar component for items
import Layout from '@/components/Layout';
import { useUser } from '@/context/users';
import { Meta } from '@/layouts/Meta';

const Armory = () => {
  const [data, setData] = useState({ citizens: 0, gold: 0, goldInBank: 0 });
  const { user } = useUser();

  const itemMapFunction = (item, idPrefix: string, itemType: string) => {
    return {
      id: `${itemType}_${idPrefix}_${item.level}`,
      name: item.name,
      bonus: item.bonus,
      ownedItems:
        user.items.find(
          (i) =>
            i.type === item.type &&
            i.level === item.level &&
            i.unitType === item.usage
        )?.quantity || 0,
      cost: new Intl.NumberFormat('en-GB').format(item.cost),
      enabled: item.level <= user?.fortLevel,
      level: item.level,
    };
  };

  useEffect(() => {
    setData({
      offensiveWeapons: user?.availableItemTypes
        .filter((item) => item.usage === 'OFFENSE' && item.type === 'WEAPON')
        .map((item) => itemMapFunction(item, 'OFFENSE', 'WEAPON')),
      // ... (Similarly, map other item types and categories)
    });
  }, [user]);

  return (
    <Layout meta={<Meta title="Armory" description="Equip your troops" />}>
      <div className="mainArea pb-10">
        <h2 className="text-2xl font-bold">Armory</h2>
        <div className="my-5 flex justify-around">
          <p className="mb-0">
            Citizens: <span>{user?.citizens}</span>
          </p>
          <p className="mb-0">
            Gold On Hand: <span>{user?.gold}</span>
          </p>
          <p className="mb-0">
            Banked Gold: <span>{user?.goldInBank}</span>
          </p>
        </div>
        <ItemSection
          heading="Offensive Weapons"
          items={data.offensiveWeapons}
        />
        {/* ... (Similarly, render other item sections) */}
      </div>
    </Layout>
  );
};

export default Armory;
