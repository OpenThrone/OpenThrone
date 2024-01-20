import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const UpgradesIndex = () => {
  const router = useRouter();

  useEffect(() => {
    router.push('/structures/upgrades/fortifications');
  }, []);

  return null;
};

export default UpgradesIndex;
