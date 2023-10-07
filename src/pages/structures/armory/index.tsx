import { useRouter } from 'next/router';
import { useEffect } from 'react';

const Armory = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/structures/armory/offense');
  }, []);

  return null;
};

export default Armory;
