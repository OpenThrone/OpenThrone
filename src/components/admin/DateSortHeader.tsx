import { faSortDown, faSortUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Table } from '@mantine/core';

export default function DateSortHeader({
  label,
  direction,
  onToggle,
}: {
  label: string;
  direction: 'asc' | 'desc';
  onToggle: () => void;
}) {
  return (
    <Table.Th aria-sort={direction === 'asc' ? 'ascending' : 'descending'}>
      <Button
        variant="subtle"
        size="compact-sm"
        onClick={onToggle}
        rightSection={
          <FontAwesomeIcon
            icon={direction === 'asc' ? faSortUp : faSortDown}
            aria-hidden="true"
          />
        }
      >
        {label}
      </Button>
    </Table.Th>
  );
}
