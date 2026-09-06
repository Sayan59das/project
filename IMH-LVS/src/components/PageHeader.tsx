import { Box, Typography } from '@mui/material';

type Props = {
  title: string;
  subtitle?: string;
};

export function PageHeader({ title, subtitle }: Props) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h3" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mt: 1 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}
