import toLocale from '@/utils/numberFormatting';
import { Table, Button, Text, Popover } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Link from 'next/link';
import React from 'react';

const StatsTable = ({ title, data, description = "description" }) => {
  const [opened, { close, open }] = useDisclosure(false);
  return (
    <div>
      <center>
        <Popover withArrow shadow="md" width={250} opened={opened} position="bottom">
          <Popover.Target>
            <h2 className="text-xl font-semibold mb-4" onMouseEnter={open} onMouseLeave={close}>{title}</h2>
          </Popover.Target>
          <Popover.Dropdown style={{ pointerEvents: 'none' }}>
            <Text>{description}</Text>
          </Popover.Dropdown>
        </Popover>
      </center>
      <Table className="min-w-full table-auto" color='dark' striped highlightOnHover> 
        <Table.Thead className="border-b">
          <Table.Tr className="bg-table-odd">
            <Table.Th className="text-sm font-medium px-6 py-4 text-left">
              Rank
            </Table.Th>
            <Table.Th className="text-sm font-medium px-6 py-4 text-left">
              Player
            </Table.Th>
            <Table.Th className="text-sm font-medium px-6 py-4 text-left">
              Stat
            </Table.Th>
            <th className="text-sm font-medium px-6 py-4 text-center content-center">
              <Text>Action</Text>
            </th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((player, index) => (
            <Table.Tr key={index} className="border-b odd:bg-table-even even:bg-table-odd">
              <Table.Td className="px-6 py-4 whitespace-nowrap text-sm">
                {index + 1}
              </Table.Td>
              <Table.Td className="px-6 py-4 whitespace-nowrap text-sm">
                {player.display_name}
              </Table.Td>
              <Table.Td className="px-6 py-4 whitespace-nowrap text-sm">
                {toLocale(player.stat) || 0}
              </Table.Td>
              <Table.Td className="px-6 py-4 whitespace-nowrap text-sm text-center content-center">
                <Link href={'/userprofile/'+player.id}><Button color='dark' className=" text-white font-bold py-2 px-4 rounded">
                  View Profile
                </Button></Link>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
};

export default StatsTable;
