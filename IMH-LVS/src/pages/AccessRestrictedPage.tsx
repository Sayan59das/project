import { Box, Button, Paper, Typography } from '@mui/material';
import { MdLockOutline } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';

export function AccessRestrictedPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 4, md: 8 } }}>
      <Paper sx={{ p: 5, borderRadius: 4, maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: '#FDEDE9',
            color: '#D32F2F',
            display: 'grid',
            placeItems: 'center',
            mx: 'auto',
            mb: 3
          }}
        >
          <MdLockOutline size={32} />
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1.5 }}>
          Access Restricted
        </Typography>
        <Typography variant="body1" sx={{ color: '#9EA4AB', mb: 4 }}>
          You don&apos;t have permission to access this module. Contact your administrator if you believe this is a
          mistake.
        </Typography>
        <Button
          variant="contained"
          sx={{ bgcolor: '#E26737', '&:hover': { bgcolor: '#d55b2f' }, textTransform: 'none', px: 4 }}
          onClick={() => navigate('/dashboard')}
        >
          Back to Dashboard
        </Button>
      </Paper>
    </Box>
  );
}
