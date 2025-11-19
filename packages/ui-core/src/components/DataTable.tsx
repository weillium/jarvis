'use client';

import { ReactNode } from 'react';
import { XStack, YStack, styled, type StackProps } from 'tamagui';
import { Body, Label } from './Typography';

const TableShell = styled(YStack, {
  name: 'DataTableShell',
  borderWidth: 1,
  borderColor: '$borderColor',
  borderRadius: '$4',
  overflow: 'hidden',
});

const ScrollArea = styled(YStack, {
  name: 'DataTableScroll',
  overflowX: 'auto',
  width: '100%',
});

const HeaderRow = styled(XStack, {
  name: 'DataTableHeaderRow',
  backgroundColor: '$gray2',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
});

const DataRow = styled(XStack, {
  name: 'DataTableRow',
  backgroundColor: '$background',
  borderBottomWidth: 1,
  borderBottomColor: '$gray3',
});

const Cell = styled(YStack, {
  name: 'DataTableCell',
  justifyContent: 'center',
  paddingVertical: '$3',
  paddingHorizontal: '$3',
  flexShrink: 0,
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

export interface DataTableProps<T> extends Omit<StackProps, 'children'> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey?: (row: T, index: number) => string | number;
  size?: 'sm' | 'md';
  emptyState?: ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  size = 'sm',
  emptyState,
  ...props
}: DataTableProps<T>) {
  if (!data.length) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <TableShell {...props}>
      <ScrollArea>
        <YStack minWidth="100%">
          <HeaderRow>
            {columns.map((column) => (
              <Cell
                key={column.header}
                align={column.align}
                size={size}
                variant="header"
                flex={column.flex ?? 1}
                minWidth={column.minWidth}
                maxWidth={column.maxWidth}
                truncate={column.truncate}
              >
                <Label size="xs" uppercase tone="muted">
                  {column.header}
                </Label>
              </Cell>
            ))}
          </HeaderRow>
          {data.map((row, rowIndex) => {
            const rowKey = getRowKey ? getRowKey(row, rowIndex) : `${rowIndex}`;
            return (
              <DataRow key={rowKey}>
                {columns.map((column) => {
                  const value = column.render
                    ? column.render(row, rowIndex)
                    : (row[column.key as keyof T] as ReactNode);
                  const textLines = column.truncate ? 1 : undefined;
                  return (
                    <Cell
                      key={`${rowKey}-${column.key}-${rowIndex}`}
                      align={column.align}
                      size={size}
                      variant="body"
                      flex={column.flex ?? 1}
                      minWidth={column.minWidth}
                      maxWidth={column.maxWidth}
                      truncate={column.truncate}
                    >
                      {typeof value === 'string' || typeof value === 'number' ? (
                        <Body
                          size={size === 'sm' ? 'sm' : 'md'}
                          numberOfLines={textLines}
                          ellipsizeMode={column.truncate ? 'tail' : undefined}
                        >
                          {value}
                        </Body>
                      ) : (
                        value
                      )}
                    </Cell>
                  );
                })}
              </DataRow>
            );
          })}
        </YStack>
      </ScrollArea>
    </TableShell>
  );
}
