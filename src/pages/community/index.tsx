import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const BankIndex = (props) => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/community/news');
  }, [router]);

  return null;
};

export default BankIndex;
