import { Box, Table } from '@mantine/core';

interface NeumorphicTableProps {
  tone?: 'light' | 'themed';
}

const neumorphicStyle = {
  backgroundColor: '#e0e5ec',
  boxShadow:
    '9px 9px 16px rgb(163,177,198,0.6), -9px -9px 16px rgba(255,255,255, 0.5)',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.2)',
};

export function NeumorphicTable({ tone = 'light' }: NeumorphicTableProps) {
  const elements = [
    { position: 6, mass: 12.011, symbol: 'C', name: 'Carbon' },
    { position: 7, mass: 14.007, symbol: 'N', name: 'Nitrogen' },
    { position: 39, mass: 88.906, symbol: 'Y', name: 'Yttrium' },
  ];

  const themedRowStyle =
    tone === 'themed'
      ? {
          backgroundColor: '#1f242b',
          boxShadow:
            '8px 8px 14px rgba(0,0,0,0.45), -6px -6px 12px rgba(255,255,255,0.04)',
          borderRadius: '12px',
          border: '1px solid rgba(234,174,43,0.2)',
        }
      : neumorphicStyle;

  const rows = elements.map((element) => (
    <Table.Tr
      key={element.name}
      style={{
        // Individual rows are "popped out" cards
        ...themedRowStyle,
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

  const wrapperStyle =
    tone === 'themed'
      ? { backgroundColor: 'transparent', minHeight: 300 }
      : { backgroundColor: '#e0e5ec', minHeight: 300 };

  const headerStyle =
    tone === 'themed'
      ? { borderBottom: 'none', color: '#f5d86a' }
      : { borderBottom: 'none', color: '#8898aa' };

  return (
    <Box p="xl" style={wrapperStyle}>
      <Box
        style={{
          padding: '14px',
          borderRadius: '12px',
          border:
            tone === 'themed' ? '1px solid rgba(234,174,43,0.25)' : undefined,
          background:
            tone === 'themed'
              ? 'linear-gradient(180deg, rgba(18,20,24,0.96), rgba(10,12,16,0.96))'
              : undefined,
          boxShadow:
            tone === 'themed' ? '0 12px 26px rgba(0,0,0,0.4)' : undefined,
        }}
      >
        <Table
          style={{
            borderCollapse: 'separate',
            borderSpacing: '0 12px',
            width: '100%',
          }}
        >
          <Table.Thead>
            <Table.Tr
              style={
                tone === 'themed'
                  ? {
                      backgroundColor: 'rgba(234,174,43,0.08)',
                      borderRadius: '10px',
                    }
                  : undefined
              }
            >
              <Table.Th style={{ ...headerStyle, paddingLeft: 20 }}>
                NO.
              </Table.Th>
              <Table.Th style={headerStyle}>NAME</Table.Th>
              <Table.Th style={headerStyle}>SYMBOL</Table.Th>
              <Table.Th style={headerStyle}>MASS</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}
