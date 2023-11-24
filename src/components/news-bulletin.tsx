import { useEffect, useState } from "react";

const NewsBulletin: React.FC = () => {
  const [message, setMessage] = useState(process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE);
  useEffect(() => {
    if (process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE && process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE !== '') {
      setMessage(process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE);
    }
  }, []);
  return (
    <div className="container mx-auto px-4">
      <div className="my-3">
        <div className="relative rounded px-3 py-2 bg-gray-800 text-yellow shadow-lg border border-gray-900">
          <h3 className="font-bold text-md uppercase text-center">Important</h3>
          <p className="font-semibold text-sm">{message}</p>
        </div>
      </div>
    </div>

  );
};

export default NewsBulletin;
