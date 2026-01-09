import { Table, Paper, Text, Box } from '@mantine/core';

interface PaperTableProps {
  tone?: 'light' | 'themed';
}

export function PaperTable({ tone = 'light' }: PaperTableProps) {
  const elements = [
    { position: 6, mass: 12.011, symbol: 'C', name: 'Carbon' },
    { position: 7, mass: 14.007, symbol: 'N', name: 'Nitrogen' },
    { position: 39, mass: 88.906, symbol: 'Y', name: 'Yttrium' },
    { position: 56, mass: 137.33, symbol: 'Ba', name: 'Barium' },
    { position: 58, mass: 140.12, symbol: 'Ce', name: 'Cerium' },
  ];

  const cellTextColor = tone === 'themed' ? '#3b2a13' : undefined;
  const rows = elements.map((element, index) => (
    <Table.Tr
      key={element.name}
      style={tone === 'themed'
        ? {
            backgroundColor: index % 2 === 0 ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.02)',
          }
        : undefined
      }
    >
      <Table.Td style={{ color: cellTextColor }}>{element.position}</Table.Td>
      <Table.Td style={{ color: cellTextColor }}>{element.name}</Table.Td>
      <Table.Td style={{ color: cellTextColor }}>{element.symbol}</Table.Td>
      <Table.Td style={{ color: cellTextColor }}>{element.mass}</Table.Td>
    </Table.Tr>
  ));

  const wrapperBg = tone === 'themed' ? 'transparent' : 'gray.1';
  const paperBg =
    tone === 'themed'
      ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.07'/%3E%3C/svg%3E"), linear-gradient(to bottom, #f1e3c6, #e1cfaa)`
      : `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E"), linear-gradient(to bottom, #ffffff, #fafafa)`;
  const borderColor = tone === 'themed' ? '#8b6b2e' : '#e0e0e0';
  const headerColor = tone === 'themed' ? '#4a2d0b' : undefined;

  return (
    <Box p="xl" bg={wrapperBg}>
      <Paper
        shadow="xl"
        radius="md"
        p="md"
        style={{
          // CSS Noise generation
          backgroundImage: paperBg,
          border: `1px solid ${borderColor}`,
          boxShadow: tone === 'themed' ? '0 12px 28px rgba(0,0,0,0.35)' : undefined,
        }}
      >
        <Table striped highlightOnHover withRowBorders={true}>
          <Table.Thead
            style={{
              borderBottom: `2px solid ${borderColor}`,
              backgroundColor: 'transparent'
            }}
          >
            <Table.Tr>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase', color: headerColor }}>Position</Table.Th>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase', color: headerColor }}>Element</Table.Th>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase', color: headerColor }}>Symbol</Table.Th>
              <Table.Th style={{ letterSpacing: '1px', textTransform: 'uppercase', color: headerColor }}>Mass</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Paper>
    </Box>
  );
}
