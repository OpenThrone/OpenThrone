import React from 'react';
import { Accordion, Text, Group, Badge } from '@mantine/core';
import { GameCard } from './GameCard';

interface NewsItem {
  id: number;
  title: string;
  content: string;
  created_timestamp: string;
  read: boolean;
}

interface StyledNewsProps {
  news: NewsItem[];
}

export const StyledNews: React.FC<StyledNewsProps> = ({ news }) => {
  return (
    <GameCard title="War Room Intelligence">
      <Accordion variant="contained" defaultValue={news[0]?.id.toString()}>
        {news.map((item) => (
          <Accordion.Item key={item.id} value={item.id.toString()} style={{ backgroundColor: '#0f141a', borderBottom: '1px solid #1f2b3b', borderRadius: '4px', marginBottom: '4px' }}>
            <Accordion.Control>
              <Group justify="space-between">
                <Text size="sm" fw={600} c="gray.2">
                  {item.title}
                </Text>
                <Group gap="xs">
                  {!item.read && <Badge size="xs" color="yellow">NEW</Badge>}
                  <Text size="xs" c="dimmed">
                    {new Date(item.created_timestamp).toLocaleDateString()}
                  </Text>
                </Group>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="sm" c="gray.4">
                {item.content}
              </Text>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </GameCard>
  );
};