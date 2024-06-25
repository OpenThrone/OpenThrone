import React, { useState, useEffect } from 'react';
import { Table, Loader, Group, Paper } from '@mantine/core';

const Enemies = (props) => {
  const [enemies, setEnemies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/listAll?type=ENEMY')
      .then(response => response.json())
      .then(data => {
        setEnemies(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <Loader />;

  const rows = enemies.map(enemy => (
    <Table.Tr key={enemy.id}>
      <Table.Td>{enemy.playerId}</Table.Td>
      <Table.Td>{enemy.status}</Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Enemies</h2>
      <Paper shadow="xs" p="md">
        <Table className="min-w-full" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Player ID</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Paper>
    </div>
  );
};

export default Enemies;