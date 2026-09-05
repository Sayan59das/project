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
    <TableContainer component={Paper} sx={{ boxShadow: '0 18px 45px rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
      <Table>
        <TableHead sx={{ bgcolor: '#FFFFFF' }}>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.accessor} sx={{ fontWeight: 700, color: '#2E3135', borderBottom: 'none', py: 2, fontSize: 14 }}>
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
                '&:hover': { bgcolor: '#FFF8F2' },
                '& td': { borderBottom: 'none', py: 2 }
              }}
            >
              {columns.map((column) => (
                <TableCell key={column.accessor} sx={{ color: '#9EA4AB' }}>
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
