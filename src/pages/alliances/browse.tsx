import { Card, Avatar, Text, Group, Button, SimpleGrid, Image } from '@mantine/core';
import classes from './browse.module.css';
import toLocale from '@/utils/numberFormatting';


export const UserCardImage = ({name, members, description, gold, joinText, imgsrc, bannerimgsrc}) => {

  return (
    <Card withBorder padding="xl" radius="md" className={classes.card}>
      <Card.Section>
        <Image src={bannerimgsrc} alt={name} fit='none' style={{ height: '140px' }} width={'100%'} /></Card.Section>
      <Avatar
        src={imgsrc}
        size={120}
        radius={120}
        mx="auto"
        mt={-30}
        className={classes.avatar}
      />
      <Text ta="center" fz="lg" fw={500} mt="sm">
        {name}
      </Text>
      <Text ta="center" fz="sm" c="dimmed">
        {description}
      </Text>
      <Group mt="md" justify="center" gap={30}>
        <div>
          <Text ta="center" fz="lg" fw={500}>
            {toLocale(gold)}
          </Text>
          <Text ta="center" fz="sm" c="dimmed" lh={1}>
            Gold
          </Text>
          <Text ta="center" fz="lg" fw={500}>
            {toLocale(members)}
          </Text>
          <Text ta="center" fz="sm" c="dimmed" lh={1}>
            Members
          </Text>
        </div>
      </Group>
      <Button fullWidth radius="md" mt="xl" size="md" variant="default">
        {joinText || 'Join'}
      </Button>
    </Card>
  );
}


const Browse = () => {

  return (
      <SimpleGrid cols={{ base: 1, sm: 2, md:3, lg:3 }}>
      <UserCardImage name="A Mega Force" description={"Strength & Honor"} members={1000} gold={"123123123123123n"} joinText={''} imgsrc={"/assets/images/amf.jpg"} bannerimgsrc={'/assets/images/amf-banner.png'} />
      <UserCardImage name={"The Great Elves"} members={"234"} description={""} gold={42234} joinText={''} imgsrc={'/assets/images/TheGreatElves.webp'} bannerimgsrc={'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80'} />
      <UserCardImage name={"DarkCurse"} members={"12"} description={""} gold={1231311} joinText={"Join Tody"} imgsrc={'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-9.png'} bannerimgsrc={'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80'} />
      <UserCardImage name={"DeathGang"} members={"631"} description={""} gold={142121123} joinText={""} imgsrc={'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-9.png'} bannerimgsrc={'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80'} />
      <UserCardImage name={"Everto"} members={"214"} description={""} gold={12312} joinText={"Request to Join"} imgsrc={'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-9.png'} bannerimgsrc={'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80'} />
        </SimpleGrid>
  );
};

export default Browse;
