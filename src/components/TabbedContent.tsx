/**
 * @deprecated Use Mantine <Tabs> component instead — 6 pages already use it
 * as the standard (bank, armory, upgrades, alliances, admin). Custom styling
 * can be achieved via Mantine theme overrides.
 */

import React, { useState } from 'react';

type Tab = {
  label: string;
  content: React.ReactNode;
};

type TabbedContentProps = {
  tabs: Tab[];
};

const TabbedContent: React.FC<TabbedContentProps> = ({ tabs }) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(index)}
              className={`${
                activeTab === index
                  ? 'border-yellow-500 text-yellow-500'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              } whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-yellow-500`}
              aria-current={activeTab === index ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="py-4">{tabs[activeTab].content}</div>
    </div>
  );
};

export default TabbedContent;
