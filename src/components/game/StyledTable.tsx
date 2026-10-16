import { Box, Table } from '@mantine/core';
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import classes from '@/components/game/Panels.module.css';

/** `data-*` attributes are legal in JSX but not in Mantine prop object types. */
type WithDataAttributes<T> = T & Record<`data-${string}`, string | undefined>;
interface StyledTableProps {
  /**
   * Header labels. Plain strings render as default cells; full
   * `<Table.Th>` nodes render as-is when a column needs bespoke markup
   * (sortable controls, custom styles, test ids).
   */
  headers: ReactNode[];
  children: ReactNode;
  /** Accessible name for the scroll region; defaults to the string headers. */
  ariaLabel?: string;
  /** Props forwarded to the inner Mantine Table. */
  tableProps?: WithDataAttributes<ComponentProps<typeof Table>>;
  /** Props forwarded to the header row. */
  headerRowProps?: ComponentProps<typeof Table.Tr>;
  /** Props forwarded to the table header section. */
  theadProps?: WithDataAttributes<ComponentProps<typeof Table.Thead>>;
  /** Test id for the scroll region; defaults to `table-wrapper`. */
  regionTestId?: string;
}

/** A readable ledger with contained horizontal scrolling on narrow screens. */
export const StyledTable = ({
  headers,
  children,
  ariaLabel,
  tableProps,
  headerRowProps,
  theadProps,
  regionTestId = 'table-wrapper',
}: StyledTableProps) => {
  const regionRef = useRef<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncOverflow = useCallback(() => {
    const el = regionRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
  }, []);

  useEffect(() => {
    const el = regionRef.current;
    if (!el) return undefined;
    syncOverflow();
    el.addEventListener('scroll', syncOverflow);
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', syncOverflow);
      observer.disconnect();
    };
  }, [syncOverflow]);

  const regionLabel =
    ariaLabel ??
    headers
      .filter((head): head is string => typeof head === 'string')
      .join(', ');

  return (
    <Box style={{ minWidth: 0, overflow: 'hidden', position: 'relative' }}>
      <Box
        ref={regionRef}
        className={classes.tableRegion}
        role="region"
        aria-label={regionLabel}
        tabIndex={0}
        data-testid={regionTestId}
      >
        <Table verticalSpacing="sm" data-testid="styled-table" {...tableProps}>
          <Table.Thead {...theadProps}>
            <Table.Tr {...headerRowProps}>
              {headers.map((head, index) =>
                typeof head === 'string' ? (
                  <Table.Th key={index}>{head}</Table.Th>
                ) : (
                  head
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{children}</Table.Tbody>
        </Table>
      </Box>
      {canScrollRight && (
        <Box className={classes.tableScrollCue} aria-hidden="true" />
      )}
    </Box>
  );
};
