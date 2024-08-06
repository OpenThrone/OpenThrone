import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const BankIndex = (props) => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/battle/users');
  }, [router]);

  return null;
};

export default BankIndex;
