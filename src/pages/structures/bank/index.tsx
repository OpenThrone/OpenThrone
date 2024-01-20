import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const BankIndex = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/structures/bank/deposit');
  }, []);

  return null;
};

export default BankIndex;
