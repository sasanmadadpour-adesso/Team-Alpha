import { type ReactNode, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Value used for sorting. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  empty?: ReactNode;
  caption?: string;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  footer?: ReactNode;
}

/**
 * Accessible sortable table. Sorting is client-side on already-fetched rows.
 */
export function DataTable<T>({
  columns, rows, rowKey, onRowClick, selectedKey, empty, caption, initialSort, footer,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right), 'de', { numeric: true }) * factor;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' });
  };

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <>
      <div className="table-scroll">
        <table className="table">
          {caption ? <caption className="visually-hidden">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.numeric ? 'num' : undefined}
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {column.sortValue ? (
                      <button type="button" onClick={() => toggle(column.key)}>
                        {column.header}
                        {active
                          ? (sort!.direction === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)
                          : <ChevronsUpDown size={12} aria-hidden style={{ opacity: 0.4 }} />}
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  data-clickable={onRowClick ? 'true' : undefined}
                  aria-selected={selectedKey === key || undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick
                    ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRowClick(row); }
                    }
                    : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={column.numeric ? 'num' : undefined}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer ? <div className="table__meta">{footer}</div> : null}
    </>
  );
}
