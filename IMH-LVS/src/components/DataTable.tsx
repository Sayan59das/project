import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { StatusChip } from './StatusChip';

type Column = {
  header: string;
  accessor: string;
};

type DataRow = Record<string, string | number>;

type Props = {
  columns: Column[];
  rows: DataRow[];
};

export function DataTable({ columns, rows }: Props) {
  return (
    <TableContainer component={Paper} sx={{ boxShadow: 'var(--c-shadow-paper)', borderRadius: 4, overflow: 'hidden' }}>
      <Table>
        <TableHead sx={{ bgcolor: 'var(--c-paper)' }}>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.accessor} sx={{ fontWeight: 700, color: 'var(--c-text-1)', borderBottom: 'none', py: 2, fontSize: 14 }}>
                {column.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={index}
              hover
              sx={{
                transition: 'background 0.25s ease',
                '&:hover': { bgcolor: 'var(--c-tint-orange)' },
                '& td': { borderBottom: 'none', py: 2 }
              }}
            >
              {columns.map((column) => (
                <TableCell key={column.accessor} sx={{ color: 'var(--c-text-3)' }}>
                  {column.accessor === 'status' ? <StatusChip status={String(row[column.accessor])} /> : row[column.accessor]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
