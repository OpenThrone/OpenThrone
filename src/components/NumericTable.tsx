import { Table, Box } from '@mantine/core';

// Helper to generate the "soft" shadow style
const neumorphicStyle = {
  backgroundColor: '#e0e5ec',
  boxShadow: '9px 9px 16px rgb(163,177,198,0.6), -9px -9px 16px rgba(255,255,255, 0.5)',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.2)',
};

export function NeumorphicTable() {
  const elements = [
    { position: 6, mass: 12.011, symbol: 'C', name: 'Carbon' },
    { position: 7, mass: 14.007, symbol: 'N', name: 'Nitrogen' },
    { position: 39, mass: 88.906, symbol: 'Y', name: 'Yttrium' },
  ];

  const rows = elements.map((element) => (
    <Table.Tr
      key={element.name}
      style={{
        // Individual rows are "popped out" cards
        ...neumorphicStyle,
        transition: 'transform 0.2s ease',
      }}
    // Use css module or emotion for hover state transform: scale(1.02)
    >
      <Table.Td style={{ borderBottom: 'none' }}>{element.position}</Table.Td>
      <Table.Td style={{ borderBottom: 'none' }}>{element.name}</Table.Td>
      <Table.Td style={{ borderBottom: 'none' }}>{element.symbol}</Table.Td>
      <Table.Td style={{ borderBottom: 'none' }}>{element.mass}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Box p="xl" style={{ backgroundColor: '#e0e5ec', minHeight: 300 }}>
      <Table
        style={{
          borderCollapse: 'separate',
          borderSpacing: '0 15px' // Critical for spacing out the "cards"
        }}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ borderBottom: 'none', color: '#8898aa', paddingLeft: 20 }}>NO.</Table.Th>
            <Table.Th style={{ borderBottom: 'none', color: '#8898aa' }}>NAME</Table.Th>
            <Table.Th style={{ borderBottom: 'none', color: '#8898aa' }}>SYMBOL</Table.Th>
            <Table.Th style={{ borderBottom: 'none', color: '#8898aa' }}>MASS</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Box>
  );
}