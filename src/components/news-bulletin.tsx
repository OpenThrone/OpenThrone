import { useEffect, useState } from 'react';
import { Text, Title } from '@mantine/core';
import ContentCard from './ContentCard';

const NewsBulletin: React.FC = () => {
  const [message, setMessage] = useState(
    process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE ?? ''
  );

  useEffect(() => {
    if (!process || !process.env || !process.env.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE) {
      return;
    }
    setMessage(process.env.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE);
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div className="container mx-auto px-4">
      <div className="my-3">
        <ContentCard
          title="Important"
          titlePosition='center'
          titleSize='lg'
          variant='highlight'
        >
          <Text size='md' className="font-semibold text-center text-yellow">{message}</Text>
        </ContentCard>
      </div>
    </div>
  );
};

export default NewsBulletin;
