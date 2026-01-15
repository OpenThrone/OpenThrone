import React, { useState } from 'react';

type CollapsibleSectionProps = {
  title: string;
  children: React.ReactNode;
  /** Whether the section should be open by default (initial state). */
  defaultOpen?: boolean;
};

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(Boolean(defaultOpen));

  return (
    <div className="border-b border-gray-200 py-4">
      <h3>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between text-lg font-medium text-black hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          aria-expanded={isOpen}
        >
          <span className="text-yellow-500 text-shadow-color-white">
            {title}
          </span>
          <span
            className={`transition-transform${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            &#9662;
          </span>
        </button>
      </h3>
      {isOpen && <div className="mt-4">{children}</div>}
    </div>
  );
};

export default CollapsibleSection;
