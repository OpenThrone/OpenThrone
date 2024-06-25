import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const UpgradesIndex = (props) => {
  const router = useRouter();

  useEffect(() => {
    router.push('/structures/upgrades/fortifications');
  }, [router]);

  return null;
};

export default UpgradesIndex;
