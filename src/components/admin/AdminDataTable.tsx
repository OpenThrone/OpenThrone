import type { TableProps } from '@mantine/core';
import { Table } from '@mantine/core';
import type { ReactNode } from 'react';

import classes from '@/components/admin/AdminDataTable.module.css';

/**
 * The single admin min-width rule: a table keeps its columns readable down
 * to this width, then scrolls horizontally inside its container.
 * - `compact`: up to 4 columns (lookups, small summaries)
 * - `default`: 5-7 columns (most moderation lists)
 * - `wide`: 8+ columns (logs and ledgers)
 */
export const ADMIN_TABLE_MIN_WIDTH = {
  compact: 480,
  default: 720,
  wide: 1000,
} as const;

export type AdminTableSize = keyof typeof ADMIN_TABLE_MIN_WIDTH;

interface AdminDataTableProps extends Omit<
  TableProps,
  'striped' | 'highlightOnHover'
> {
  children: ReactNode;
  /** Column density; picks the shared scroll min-width. */
  size?: AdminTableSize;
  /** Accessible name for the scroll container. */
  ariaLabel?: string;
}

/**
 * Shared admin/moderation data table: one scroll min-width rule, zebra rows
 * and one hover convention (all from AdminDataTable.module.css).
 */
export function AdminDataTable({
  children,
  size = 'default',
  ariaLabel,
  className,
  ...tableProps
}: AdminDataTableProps) {
  return (
    <Table.ScrollContainer
      minWidth={ADMIN_TABLE_MIN_WIDTH[size]}
      aria-label={ariaLabel}
    >
      <Table
        verticalSpacing="xs"
        {...tableProps}
        className={[classes.table, className].filter(Boolean).join(' ')}
      >
        {children}
      </Table>
    </Table.ScrollContainer>
  );
}

export default AdminDataTable;
