import { Box, Paper, Typography } from '@mui/material';
import * as Icons from 'react-icons/md';

export type DashboardStatCard = {
  title: string;
  value: number | string;
  icon: string;
  color: string;
  caption?: string;
};

type Props = {
  card: DashboardStatCard;
  onClick?: () => void;
};

export function StatCard({ card, onClick }: Props) {
  const Icon = (Icons as any)[card.icon];

  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minWidth: 220,
        borderRadius: 4,
        bgcolor: 'var(--c-paper)',
        border: '1px solid rgba(230,103,55,0.12)',
        backdropFilter: 'blur(10px)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s ease',
        '&:hover': onClick ? { boxShadow: 'var(--c-shadow-card)' } : undefined
      }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)', mb: 1 }}>
          {card.title}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {card.value}
        </Typography>
        {card.caption && (
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mt: 0.5 }}>
            {card.caption}
          </Typography>
        )}
      </Box>
      <Box sx={{ width: 52, height: 52, borderRadius: '50%', bgcolor: `${card.color}22`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {Icon && <Icon size={24} color={card.color} />}
      </Box>
    </Paper>
  );
}
