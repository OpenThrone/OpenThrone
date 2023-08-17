import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

interface LayoutContextProps {
  title?: string;
  description?: string;
  setMeta?: (meta: { title?: string; description?: string }) => void;
}

const LayoutContext = createContext<LayoutContextProps>({});

export const useLayout = () => useContext(LayoutContext);

interface LayoutProviderProps {
  children: ReactNode;
}

export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const [meta, setMeta] = useState({ title: '', description: '' });

  return (
    <LayoutContext.Provider value={{ ...meta, setMeta }}>
      {children}
    </LayoutContext.Provider>
  );
};
