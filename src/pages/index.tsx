import React, { useEffect } from 'react';

import { useLayout } from '@/context/LayoutContext';
import MainArea from '@/components/MainArea';

const Index = (props) => {
  const { setMeta, meta } = useLayout();

  useEffect(() => {
    if (setMeta && meta && meta.title !== 'OpenThrone') {
      setMeta({
        title: 'OpenThrone',
        description: 'Meta Description',
      });
    }
  }, [meta, setMeta]);
  return (
    <>
      <MainArea
        title="Open Throne">
      <div className="mx-auto xs:w-96 md:w-3/4 py-2 md:col-span-9">
        <div className="advisor my-3 rounded-lg px-4 py-2 shadow-md">
          <div className="flex justify-center">
            <ul className="list-inside list-disc">
              <li>
                Choose between four unique races: Undead, Humans, Goblins, Elves
              </li>
              <li>
                Train citizens as workers, offensive or defensive soldiers, and
                spies
              </li>
              <li>Equip your army with weapons and armor</li>
              <li>
                Play with friends,{' '}
                <span className="line-through">create your own alliance</span>,
                and communicate via the in-game message system
              </li>
              <li>
                <span>
                  Create a character profile with a custom avatar
                </span>
              </li>
              <li>
                Stay in contact with the game&apos;s developers via the OpenThrone
                {' '}<a style={{'color': 'darkgreen'}} href={'https://discord.gg/J2gw2xvh3R'}>Discord</a>
              </li>
            </ul>
          </div>
        </div>
        </div>
        </MainArea>
    </>
  );
};

export default Index;
