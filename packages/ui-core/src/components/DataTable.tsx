'use client';

import { ReactNode, useMemo } from 'react';
import { XStack, YStack, styled, type StackProps } from 'tamagui';
import { Label } from './Typography';
import { ClampText } from './ClampText';

const TableShell = styled(YStack, {
  name: 'DataTableShell',
  borderWidth: 1,
  borderColor: '$borderColor',
  borderRadius: '$4',
  overflow: 'hidden',
});

const ScrollArea = styled(YStack, {
  name: 'DataTableScroll',
  overflow: 'scroll',
  width: '100%',
});

const HeaderRow = styled(XStack, {
  name: 'DataTableHeaderRow',
  backgroundColor: '$gray2',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  width: '100%',
});

const DataRow = styled(XStack, {
  name: 'DataTableRow',
  backgroundColor: '$background',
  borderBottomWidth: 1,
  borderBottomColor: '$gray3',
  width: '100%',
  variants: {
    isTotals: {
      true: {
        backgroundColor: '$gray2',
        borderTopWidth: 2,
        borderTopColor: '$borderColor',
        borderBottomWidth: 1,
        borderBottomColor: '$gray3',
      },
    },
  } as const,
  defaultVariants: {
    isTotals: false,
  },
});

const Cell = styled(YStack, {
  name: 'DataTableCell',
  justifyContent: 'center',
  paddingVertical: '$3',
  paddingHorizontal: '$3',
  flexShrink: 1, // Allow shrinking to maintain column width consistency
  minWidth: 0, // Critical: allows flex items to shrink below content size, enabling proper wrapping
  // flexGrow and flexBasis will be set dynamically per column to ensure consistency
  variants: {
    align: {
      left: { alignItems: 'flex-start' },
      right: { alignItems: 'flex-end' },
      center: { alignItems: 'center' },
    },
    size: {
      sm: {
        paddingVertical: '$2',
        paddingHorizontal: '$3',
      },
      md: {
        paddingVertical: '$3',
        paddingHorizontal: '$4',
      },
    },
    variant: {
      header: {
        backgroundColor: '$gray2',
      },
      body: {
        backgroundColor: '$background',
      },
    },
    truncate: {
      true: {
        overflow: 'hidden',
      },
      false: {
        overflow: 'visible',
      },
    },
  } as const,
  defaultVariants: {
    align: 'left',
    size: 'sm',
    variant: 'body',
    truncate: false,
  },
});

export interface DataTableColumn<T> {
  key: keyof T | string;
  header: string;
  align?: 'left' | 'center' | 'right';
  flex?: number;
  minWidth?: number;
  maxWidth?: number;
  truncate?: boolean;
  render?: (row: T, index: number) => ReactNode;
}

export interface DataTableTotalsRow {
  [key: string]: ReactNode;
}

export interface DataTableProps<T> extends Omit<StackProps, 'children'> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey?: (row: T, index: number) => string | number;
  size?: 'sm' | 'md';
  emptyState?: ReactNode;
  totalsRow?: DataTableTotalsRow;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  size = 'sm',
  emptyState,
  totalsRow,
  ...props
}: DataTableProps<T>) {
  if (!data.length) {
    return emptyState ? <>{emptyState}</> : null;
  }

  // Calculate column flex properties to ensure consistency across all rows
  // All cells in the same column will use the same flex values, ensuring consistent widths
  const columnFlexConfigs = useMemo(() => {
    const totalFlex = columns.reduce((sum, col) => sum + (col.flex ?? 1), 0);
    const configs: Array<{ 
      flex: number; 
      flexBasis: string | number | undefined; 
      minWidth?: number; 
      maxWidth?: number;
    }> = [];
    
    columns.forEach((column) => {
      const flex = column.flex ?? 1;
      const flexRatio = flex / totalFlex;
      // Use flexBasis as percentage to ensure consistent starting width
      // All cells in this column will have the same flexBasis
      configs.push({
        flex: flexRatio,
        flexBasis: `${flexRatio * 100}%`,
        minWidth: column.minWidth,
        maxWidth: column.maxWidth,
      });
    });
    
    return configs;
  }, [columns]);

  return (
    <TableShell {...props}>
      <ScrollArea>
        <YStack width="100%">
          <HeaderRow>
                {columns.map((column, colIndex) => {
                  const flexConfig = columnFlexConfigs[colIndex];
                  return (
                    <Cell
                      key={column.header}
                      align={column.align}
                      size={size}
                      variant="header"
                      flex={flexConfig.flex}
                      // flexBasis is a percentage string which is valid CSS but TypeScript doesn't recognize it
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                      flexBasis={flexConfig.flexBasis as any}
                      minWidth={flexConfig.minWidth ?? 0}
                      maxWidth={flexConfig.maxWidth}
                      truncate={column.truncate}
                    >
                      <Label size="xs" uppercase tone="muted">
                        {String(column.header)}
                      </Label>
                    </Cell>
                  );
                })}
          </HeaderRow>
          {data.map((row, rowIndex) => {
            const rowKey = getRowKey ? getRowKey(row, rowIndex) : `${rowIndex}`;
            const isLastRow = rowIndex === data.length - 1 && !totalsRow;
            return (
              <DataRow 
                key={rowKey}
                borderBottomWidth={isLastRow ? 0 : 1}
              >
                {columns.map((column, colIndex) => {
                  const value = column.render
                    ? column.render(row, rowIndex)
                    : (row[column.key as keyof T] as ReactNode);
                  const flexConfig = columnFlexConfigs[colIndex];
                  return (
                    <Cell
                      key={`${String(rowKey)}-${String(column.key)}-${rowIndex}`}
                      align={column.align}
                      size={size}
                      variant="body"
                      flex={flexConfig.flex}
                      // flexBasis is a percentage string which is valid CSS but TypeScript doesn't recognize it
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                  flexBasis={flexConfig.flexBasis as any}
                      minWidth={flexConfig.minWidth ?? 0}
                      maxWidth={flexConfig.maxWidth}
                      truncate={column.truncate}
                    >
                      {typeof value === 'string' || typeof value === 'number' ? (
                        <ClampText
                          lines={column.truncate ? 1 : undefined}
                          fontSize={size === 'sm' ? '$2' : '$3'}
                        >
                          {value}
                        </ClampText>
                      ) : (
                        value
                      )}
                    </Cell>
                  );
                })}
              </DataRow>
            );
          })}
          {totalsRow && (
            <DataRow isTotals={true}>
              {columns.map((column, colIndex) => {
                const value = totalsRow[String(column.key)] ?? '—';
                const flexConfig = columnFlexConfigs[colIndex];
                return (
                  <Cell
                    key={`totals-${String(column.key)}-${colIndex}`}
                    align={column.align}
                    size={size}
                    variant="body"
                    flex={flexConfig.flex}
                    // flexBasis is a percentage string which is valid CSS but TypeScript doesn't recognize it
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                    flexBasis={flexConfig.flexBasis as any}
                    minWidth={flexConfig.minWidth ?? 0}
                    maxWidth={flexConfig.maxWidth}
                    truncate={column.truncate}
                    backgroundColor="$gray2"
                  >
                    {typeof value === 'string' || typeof value === 'number' ? (
                      <Label size={size === 'sm' ? 'xs' : 'sm'}>
                        {value}
                      </Label>
                    ) : (
                      value
                    )}
                  </Cell>
                );
              })}
            </DataRow>
          )}
        </YStack>
      </ScrollArea>
    </TableShell>
  );
}
