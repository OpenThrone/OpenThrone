import React, { useEffect, useState } from 'react';
import { useUser } from '@/context/users';
import { alertService } from '@/services';
import { UnitProps, UnitSectionProps } from '@/types/typings';
import { Paper, Table, NumberInput, Group, Text, Select, Button } from '@mantine/core';
import toLocale from '@/utils/numberFormatting';

type UnitSectionProps = {
  heading: string;
  units: UnitProps[];
  updateTotalCost: (costChange: number) => void;
  onTrain: any;
  onUntrain: any;
};

const NewUnitSection: React.FC<UnitSectionProps> = ({
  heading,
  units,
  updateTotalCost,
  onTrain,
  onUntrain,
}) => {
  const { user, forceUpdate } = useUser();
  const [getUnits, setUnits] = useState<UnitProps[]>(units || []);
  const [conversionAmount, setConversionAmount] = useState<number>(0);
  const [fromItem, setFromItem] = useState<string | null>(null);
  const [toItem, setToItem] = useState<string | null>(null);
  const [unitCosts, setUnitCosts] = useState<{ [key: string]: number }>({});
  const [conversionCost, setConversionCost] = useState(0);

  useEffect(() => {
    units.forEach((unit) => {
      const inputElement = document.querySelector(`input[name="${unit.id}"]`);
      if(!inputElement) return;
      inputElement?.addEventListener('input', computeTotalCostForSection);
    });

    return () => {
      units.forEach((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);
        inputElement?.removeEventListener('input', computeTotalCostForSection);
      });
    };
  }, [units, updateTotalCost]);

  useEffect(() => {
    if (!fromItem || !toItem) return;
    const fromItemData = getUnits.find((item) => item.id === fromItem);
    const toItemData = getUnits.find((item) => item.id === toItem);
    if (!fromItemData || !toItemData) return;
    const conversionCost = conversionAmount * (Number(toItemData.cost) - Number(fromItemData.cost));
    setConversionCost(conversionCost);
  }, [fromItem, toItem, conversionAmount]);


  if (!user || !user.id) {
    alertService.error('User information is not available.');
    return null;
  }

  const handleTrain = async () => {
    const unitsToTrain = units
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
        if (!inputElement) return null;
        return {
          type: unit.id.split('_')[0],
          quantity: parseInt(inputElement.value, 10),
          level: parseInt(unit.id.split('_')[1] || '1', 10),
        };
      });

    try {
      const response = await fetch('/api/training/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          units: unitsToTrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);

        setUnits((prevUnits) => {
          return prevUnits.map((unit) => {
            const unitTypeLevel = unit.id.split('_');
            const updatedUnit = data.data.find(
              (u: any) => u.type === unitTypeLevel[0] && u.level.toString() === unitTypeLevel[1]
            );
            if (updatedUnit) {
              return { ...unit, ownedUnits: updatedUnit.quantity };
            }
            return unit;
          });
        });
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to train units. Please try again.');
    }
  };

  const handleUntrain = async () => {
    const unitsToUntrain = units
      .filter((unit) => unit.enabled)
      .map((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`) as HTMLInputElement;
        return {
          type: unit.id.split('_')[0],
          quantity: parseInt(inputElement.value, 10),
          level: parseInt(unit.id.split('_')[1], 10),
        };
      });

    try {
      const response = await fetch('/api/training/untrain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          units: unitsToUntrain,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);
        setUnits((prevUnits) => {
          return prevUnits.map((unit) => {
            const unitTypeLevel = unit.id.split('_');
            const updatedUnit = data.data.find(
              (u: UnitProps) => u.type === unitTypeLevel[0] && u.level?.toString() === unitTypeLevel[1]
            );
            if (updatedUnit) {
              return { ...unit, ownedUnits: updatedUnit.quantity };
            }
            return unit;
          });
        });
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to untrain units. Please try again.');
    }
  };

  const handleConvert = async() => {
    // Conversion logic here
    if (!fromItem || !toItem || !conversionAmount) {
      alertService.error('Please select items and provide a valid quantity to convert.');
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
      console.log('Conversion successful', data);
      alertService.success('Conversion successful');
      forceUpdate();
    } catch (error) {
      console.error('Failed to convert items', error);
      alertService.error('Failed to convert items');
    }
  };

  const handleInputChange = (unitId: string, value: number) => {
    setUnitCosts((prevCosts) => {
      const newCosts = { ...prevCosts, [unitId]: value };
      computeTotalCostForSection(newCosts); // Pass the updated costs to compute the total
      return newCosts;
    });
  };

  const computeTotalCostForSection = (updatedUnitCosts: { [key: string]: number }) => {
    let sectionCost = 0;
    units.forEach((unit) => {
      const unitCost = updatedUnitCosts[unit.id] || 0;
      sectionCost += unitCost * parseInt(unit.cost.replace(/,/g, ''), 10);
    });
    updateTotalCost(sectionCost);
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
            const sortedUnits = getUnits.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
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
                            Sale Value: {toLocale(Math.floor(parseInt(unit.cost) * .75))}
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
                        defaultValue={0}
                        min={0}
                        className="w-full"
                        onChange={(value) => handleInputChange(unit.id, Number(value))}
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
      <div className="mt-4">
        <Group spacing="xs" grow>
          <Text>Convert</Text>
          <NumberInput
            value={conversionAmount}
            onChange={(value: string | number) => setConversionAmount(value as number)}
            min={0}
            className="w-32"
          />
          <Select
            data={getUnits.map((item) => ({ value: item.id, label: item.name }))}
            value={fromItem}
            onChange={setFromItem}
            placeholder="Select Unit"
            className="w-40"
          />
          <Text>to</Text>
          <Select
            data={getUnits.map((item) => ({ value: item.id, label: item.name }))}
            value={toItem}
            onChange={setToItem}
            placeholder="Select Unit"
            className="w-40"
          />
          <span>
            <Text>Cost: {toLocale(conversionCost)}</Text>
          </span>
          <Button onClick={handleConvert}>Convert</Button>
        </Group>
      </div>
    </Paper>
  );
};

export default NewUnitSection;
