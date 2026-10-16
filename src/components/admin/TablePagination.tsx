import { Group, Pagination, Select, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

interface Props {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export default function TablePagination({
  label,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const { t } = useTranslation('admin-activity');
  return (
    <Group justify="space-between" role="group" aria-label={label}>
      <Text size="sm" role="status">
        {t('showingRows', {
          from: total ? (page - 1) * pageSize + 1 : 0,
          to: Math.min(page * pageSize, total),
          total,
        })}
      </Text>
      <Select
        label={t('rowsPerPage')}
        aria-label={`${label}: ${t('rowsPerPage')}`}
        value={String(pageSize)}
        data={['10', '25', '50']}
        allowDeselect={false}
        onChange={(value) => {
          if (value) onPageSizeChange(Number(value));
        }}
        w={110}
      />
      <Pagination
        role="navigation"
        getItemProps={(pageNumber) => ({
          'aria-label': t('goToPage', { page: pageNumber }),
        })}
        getControlProps={(control) => ({
          'aria-label': t(`pagination.${control}`),
        })}
        aria-label={label}
        value={page}
        total={Math.max(1, Math.ceil(total / pageSize))}
        onChange={onPageChange}
      />
    </Group>
  );
}
