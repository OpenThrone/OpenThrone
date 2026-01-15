import { Box, Paper, Table } from '@mantine/core';
import React from 'react';

export const StyledTable = ({ headers, children }) => {
  return (
    <Paper
      radius="sm"
      style={{
        backgroundColor: '#131b29',
        border: '1px solid #2f3e52',
        overflow: 'hidden',
      }}
    >
      <Box style={{ overflowX: 'auto' }} data-testid="table-wrapper">
        <Table verticalSpacing="sm" data-testid="styled-table">
          <Table.Thead>
            <Table.Tr style={{ background: '#0e1520' }}>
              {headers.map((head) => (
                <Table.Th
                  key={head}
                  style={{
                    color: '#687b94',
                    borderBottom: '1px solid #2f3e52',
                    textTransform: 'uppercase',
                    fontSize: '11px',
                  }}
                >
                  {head}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{children}</Table.Tbody>
        </Table>
      </Box>
    </Paper>
  );
};
