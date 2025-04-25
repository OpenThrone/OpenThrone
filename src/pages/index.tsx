import React, { useEffect, useState } from 'react';

import { useLayout } from '@/context/LayoutContext';
import MainArea from '@/components/MainArea';
import { Center, Loader } from '@mantine/core';
import router from 'next/router';
import { useSession } from 'next-auth/react';
import { InferGetStaticPropsType } from "next";
import { useTranslations } from 'next-intl';

const Index = (props: InferGetStaticPropsType<typeof getStaticProps>) => {
  const t = useTranslations('Index');
  const { setMeta, meta } = useLayout();
  const { status } = useSession();
  const [isRedirecting, setIsRedirecting] = useState(true);

  useEffect(() => {
    if (setMeta && meta && meta.title !== 'OpenThrone') {
      setMeta({
        title: 'OpenThrone',
        description: t('metaDescription'),
      });
    }
  }, [meta, setMeta, t]);

  useEffect(() => {
    // Don't redirect until session status is determined
    if (status === 'loading') {
      setIsRedirecting(true); // Keep showing loader while session loads
      return;
    }

    if (status === 'authenticated') {
      router.replace('/home/overview');
      setIsRedirecting(true);
    } else {
      setIsRedirecting(false);
    }
  }, [status]);

  if (status === 'loading' || (status === 'authenticated' && isRedirecting)) {
    return (
      <MainArea title="Open Throne">
        <Center style={{ height: '50vh' }}>
          <Loader />
        </Center>
      </MainArea>
    );
  }
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

export async function getStaticProps(context) {
  // Load messages for the current locale
  const  locale  = context?.locale ||  'en-US' ;

  return {
    props: {
      messages: (await import(`../messages/${locale}.json`)).default,
      locale
    }
  };
}

export default Index;
