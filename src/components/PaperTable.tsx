import { Table, Paper, Text, Box } from '@mantine/core';

export function PaperTable() {
  const elements = [
    { position: 6, mass: 12.011, symbol: 'C', name: 'Carbon' },
    { position: 7, mass: 14.007, symbol: 'N', name: 'Nitrogen' },
    { position: 39, mass: 88.906, symbol: 'Y', name: 'Yttrium' },
    { position: 56, mass: 137.33, symbol: 'Ba', name: 'Barium' },
    { position: 58, mass: 140.12, symbol: 'Ce', name: 'Cerium' },
  ];

  const rows = elements.map((element) => (
    <Table.Tr key={element.name}>
      <Table.Td>{element.position}</Table.Td>
      <Table.Td>{element.name}</Table.Td>
      <Table.Td>{element.symbol}</Table.Td>
      <Table.Td>{element.mass}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Box p="xl" bg="gray.1">
      <Paper
        shadow="xl"
        radius="md"
        p="md"
        style={{
          // CSS Noise generation
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E"), linear-gradient(to bottom, #ffffff, #fafafa)`,
          border: '1px solid #e0e0e0',
        }}
      >
        <Table striped highlightOnHover withRowBorders={true}>
          <Table.Thead
            style={{
              borderBottom: '2px solid #000',
              backgroundColor: 'transparent'
            }}
          >
            <Table.Tr>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase' }}>Position</Table.Th>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase' }}>Element</Table.Th>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase' }}>Symbol</Table.Th>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase' }}>Mass</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Paper>
    </Box>
  );
}