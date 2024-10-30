import React, { useEffect, useMemo, useState } from 'react';
import { NumberInput, Group, Text, Paper, Table, Select, Button, Space } from '@mantine/core';
import toLocale from '@/utils/numberFormatting';
import { alertService } from '@/services';
import { useUser } from '@/context/users';

type UnitSectionProps = {
  heading: string;
  units: any[];
  updateTotalCost: (cost: number) => void;
  unitCosts: { [key: string]: number };
  setUnitCosts: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>;
};

const NewUnitSection: React.FC<UnitSectionProps> = ({
  heading,
  units,
  updateTotalCost,
  unitCosts,
  setUnitCosts,
}) => {
  const { user, forceUpdate } = useUser();
  const [currentUnits, setCurrentUnits] = useState(units);
  const [conversionAmount, setConversionAmount] = useState<number>(0);
  const [fromItem, setFromItem] = useState<string | null>(null);
  const [toItem, setToItem] = useState<string | null>(null);
  const [conversionCost, setConversionCost] = useState(0);
  const [toLower, setToLower] = useState(false);

  useEffect(() => {
    setCurrentUnits(units);
  }, [units]);

  useEffect(() => {
    if (!fromItem || !toItem) return;
    const fromItemData = units.find((item) => item.id === fromItem);
    const toItemData = units.find((item) => item.id === toItem);
    if (!fromItemData || !toItemData) return;

    setToLower(fromItemData.level > toItemData.level);
    const conversionCost = conversionAmount * (Number(toItemData.cost) - Number(fromItemData.cost)) * (toLower ? 0.75 : 1);
    setConversionCost(conversionCost * (toLower ? -1 : 1));
  }, [fromItem, toItem, conversionAmount, units, toLower]);

  const handleInputChange = (unitId: string, value: number | undefined) => {
    if (value !== undefined) {
      const newCosts = { ...unitCosts, [unitId]: value };
      computeTotalCostForSection(newCosts);
      setUnitCosts(newCosts);
    }
  };

  const computeTotalCostForSection = (updatedUnitCosts: { [key: string]: number }) => {
    let sectionCost = 0;
    units.forEach((unit) => {
      const unitCost = updatedUnitCosts[unit.id] || 0;
      sectionCost += unitCost * parseInt(unit.cost, 10);
    });
    updateTotalCost(sectionCost);
  };


  const getUnits = useMemo(() => {
    return currentUnits;
  }, [currentUnits]);


  const resetConversion = () => {
    setConversionAmount(0);
    setFromItem(null);
    setToItem(null);
  }

  const handleConvert = async () => {
    // Conversion logic here
    if (!fromItem || !toItem || !conversionAmount) {
      alertService.error('Please select items and provide a valid quantity to convert.', false, false, '', 5000);
      return;
    }
    if (conversionCost > user?.gold) {
      alertService.error('You do not have enough gold to convert the items.');
      return;
    }
    const fromData = getUnits.find((item) => item.id === fromItem);
    if (!fromData) {
      alertService.error('Invalid item selected for conversion.');
      return;
    }
    if (fromData.ownedItems < conversionAmount) {
      alertService.error('You do not have enough items to convert.');
      return;
    }
    try {
      const response = await fetch('/api/training/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          fromUnit: fromItem,
          toUnit: toItem,
          conversionAmount,
          locale: 'en-US', // Specify the locale as needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alertService.error(errorData.error);
        return;
      }

      const data = await response.json();
      alertService.success('Conversion successful');
      resetConversion();
      forceUpdate();
    } catch (error) {
      console.error('Failed to convert items', error);
      alertService.error('Failed to convert items');
    }
  };

  return (
    <Paper className="my-10 rounded-lg bg-gray-800">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-60 px-4 py-2">
              {heading}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(() => {
            const sortedUnits = units.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
            const firstDisabledUnit = sortedUnits.find((u) => !u.enabled);
            return sortedUnits.map((unit) => {
              if (unit.enabled) {
                return (
                  <Table.Tr key={unit.id}>
                    <Table.Td>
                      <Group gap={'sm'} grow>
                        <div>
                          <Text fz="lg" fw={500} className='font-medieval'>
                            {unit.name}
                            <span className='text-xs font-medieval'>
                              {' '}(+{unit.bonus} {heading})
                            </span>
                          </Text>
                          <Text fz="sm" c='#ADB5BD'>
                            Costs: {toLocale(unit.cost)} Gold
                          </Text>
                          <Text fz="sm" c='#ADB5BD'>
                            Sale Value: {toLocale(Math.round(parseInt(unit.cost) * .75))}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td className='w-80 px-4 py-2'>
                      <Group>
                        <Text fz="med" fw={500}>
                          <span className='font-medieval'>Owned: </span><span id={`${unit.id}_owned`}>{toLocale(unit.ownedUnits)}</span>
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td className='w-40 px-4 py-2'>
                      <NumberInput
                        aria-labelledby={unit.id}
                        name={unit.id}
                        value={unitCosts[unit.id] || 0}
                        min={0}
                        className="w-full"
                        onChange={(value: number | undefined) => handleInputChange(unit.id, value)}
                        allowNegative={false}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              } else if (unit.id === firstDisabledUnit?.id) {
                return (
                  <Table.Tr key={unit.id}>
                    <Table.Td className="px-4 py-2">
                      <Group gap={'sm'} grow>
                        <div>
                          <Text fz="lg" fw={500} className='font-medieval'>
                            {unit.name}
                            <span className='text-xs font-medieval'>
                              {' '}(+{unit.bonus} {unit.usage})
                            </span>
                          </Text>
                          <Text fz="sm" c='#ADB5BD'>
                            Costs: -
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td colSpan='2' className="px-4 py-2">
                      <Group>
                        <Text fz="med" fw={500} className='text-center'>
                          Unlocked with {unit.requirement}
                        </Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>

                );
              }
              return null;
            });
          })()}
        </Table.Tbody>
      </Table>
      <div className='mt-3 ml-3 mr-3'>
        <Group spacing="xs" grow>
          <Text>Convert</Text>
          <NumberInput
            value={conversionAmount}
            onChange={(value: string | number) => setConversionAmount(value as number)}
            min={0}
            className="w-32"
            allowNegative={false}
          />
          <Select
            data={units.map((item) => ({ value: item.id, label: item.name }))}
            value={fromItem}
            onChange={setFromItem}
            placeholder="Select Unit"
            className="w-40"
          />
          <Text>to</Text>
          <Select
            data={units.map((item) => ({ value: item.id, label: item.name }))}
            value={toItem}
            onChange={setToItem}
            placeholder="Select Unit"
            className="w-40"
          />
          <span>
            <Text>{toLower ? 'Refund' : 'Cost'}: {toLocale(Math.round(conversionCost))}</Text>
          </span>
          <Button className='mb-1' onClick={handleConvert}>Convert</Button>
        </Group>
      </div>
      <Space h="xs" />
    </Paper>
  );
};

export default NewUnitSection;
