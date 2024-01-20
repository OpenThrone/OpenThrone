import { useEffect, useState } from 'react';

const NewsBulletin: React.FC = () => {
  const [message, setMessage] = useState(
    process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE
  );
  useEffect(() => {
    if (
      process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE &&
      process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE !== ''
    ) {
      setMessage(process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE);
    }
  }, []);
  return (
    <div className="container mx-auto px-4">
      <div className="my-3">
        <div className="text-yellow relative rounded border border-gray-900 bg-gray-800 px-3 py-2 shadow-lg">
          <h3 className="text-md text-center font-bold uppercase">Important</h3>
          <p className="text-sm font-semibold">{message}</p>
        </div>
      </div>
    </div>
  );
};

export default NewsBulletin;
