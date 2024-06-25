import { HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { Group, Paper, rem, ThemeIcon, Text } from '@mantine/core';
import { BiCoinStack, BiSolidBank } from 'react-icons/bi';
import classes from './housing.module.css';
import { useEffect, useState } from 'react';
import toLocale from '@/utils/numberFormatting';

const Housing = (props) => {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false); // Track if component is mounted
  const [houseLevel, setHouseLevel] = useState(1);
  const [gold, setGold] = useState(BigInt(0));
  const [goldInBank, setGoldInBank] = useState(BigInt(0));
  const [citizens, setCitizens] = useState(0);
  const [citizensDaily, setCitizensDaily] = useState(0);
  const [houseUpgrade, setHouseUpgrade] = useState(HouseUpgrades[houseLevel]);

  useEffect(() => {
    setMounted(true); // Set mounted to true when component mounts
  }, []);

  useEffect(() => {
    if (!user) return;
    setHouseUpgrade(HouseUpgrades[user.houseLevel]);
    setHouseLevel(user.houseLevel);
    setGold(user.gold);
    setGoldInBank(user.goldInBank);
    setCitizens(user.citizens);
    setCitizensDaily(HouseUpgrades[user.houseLevel].citizensDaily);
  }, [user]);

  if (!mounted) return null; // Render nothing on the server

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Housing</h2>
      <div className="my-5 flex justify-center justify-evenly">
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <ThemeIcon size={30} radius={30} className={classes.icon} color='gray'>
            <BiCoinStack style={{ width: rem(15), height: rem(15) }} />
          </ThemeIcon>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Gold On Hand
            </Text>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{toLocale(gold)}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <ThemeIcon size={30} radius={30} className={classes.icon} color='gray'>
            <BiSolidBank style={{ width: rem(15), height: rem(15) }} />
          </ThemeIcon>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Banked Gold
            </Text>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{toLocale(goldInBank)}</Text>
          </Group>
        </Paper>
      </div>

      <div className="my-5 flex justify-center">
        <table className="my-4 w-10/12 table-auto text-white">
          <thead>
            <tr className="odd:bg-table-even even:bg-table-odd">
              <th colSpan={4}>Housing</th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-table-odd even:bg-table-even">
              Current Housing Level:{' '}
              <span className="text-yellow-600">
                {houseUpgrade.name}{' '}
              </span>
              <br />
              <sub className="text-gray-400">
                To upgrade your housing, visit the structure upgrades page.
              </sub>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              New Citizens Per Day:{' '}
              <span className="text-yellow-600">
                {houseUpgrade.citizensDaily}
              </span>
              <br />
              <sub className="text-gray-400">
                Housing brings new citizens to your fortification every day.
                <br />
                You will gain a new citizen every day at midnight OT time.
              </sub>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Housing;
