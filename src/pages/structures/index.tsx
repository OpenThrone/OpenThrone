import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const BankIndex = (props) => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/structures/bank');
  }, [router]);

  return null;
};

export default BankIndex;
