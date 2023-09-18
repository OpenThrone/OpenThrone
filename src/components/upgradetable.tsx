import type { Props } from 'next/script';
import React from 'react';

const UpgradeTable: React.FC<Props> = ({ heading, units, type }) => {
  if (!units) return null;

  console.log(units);

  return (
    <table className="table-dark table-striped table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Fort Level</th>
          {/* Add other conditional columns as needed */}
        </tr>
      </thead>
      <tbody />
    </table>
  );
};

export default UpgradeTable;
