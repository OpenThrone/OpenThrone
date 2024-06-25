import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const Armory = (props) => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/structures/armory/offense');
  }, [router]);

  return null;
};

export default Armory;
