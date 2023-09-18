import { useRouter } from 'next/router';
import { useEffect } from 'react';

const Upgrades = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/structures/upgrades/fortifications');
  }, []);

  return null;
};

export default Upgrades;
