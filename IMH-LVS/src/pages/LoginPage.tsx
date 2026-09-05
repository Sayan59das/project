import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import illustration from '../assets/label-verification-illustration.png';
import { useAuth } from '../auth/AuthContext';
import { getUserByEmail } from '../data/usersStore';
import { getSettings } from '../services/settingsService';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = login(email, password);
    if (result.success) {
      const user = getUserByEmail(email);
      navigate(user ? getSettings(user.id).defaultLandingPage : '/dashboard');
    } else {
      setError(result.error);
    }
  };

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#FFF7F0', overflow: 'hidden' }}>
      <Box
        component="img"
        src={illustration}
        alt="Label verification illustration"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.4,
          pointerEvents: 'none'
        }}
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} style={{ position: 'relative', zIndex: 1 }}>
        <Card sx={{ width: 420, borderRadius: '20px', boxShadow: '0 26px 90px rgba(226,103,55,0.18)', bgcolor: '#FFFFFF', position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'radial-gradient(circle at top left, rgba(226,103,55,0.08), transparent 42%)', pointerEvents: 'none' }} />
          <CardContent sx={{ position: 'relative', zIndex: 1, p: 5 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#E26737', mb: 1 }}>
              Welcome to IMH LVS
            </Typography>
            <Typography variant="body1" sx={{ color: '#9EA4AB', mb: 4, lineHeight: 1.7 }}>
              Simplified label verification for pharma packaging, artwork, and compliance.
            </Typography>

            <Box component="form" onSubmit={handleSubmit}>
              {error && (
                <Alert severity="error" sx={{ mb: 1, borderRadius: 2 }}>
                  {error}
                </Alert>
              )}

              <TextField
                fullWidth
                label="Email address"
                margin="normal"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                sx={{
                  bgcolor: '#FFF6F1',
                  borderRadius: 2,
                  '& input:-webkit-autofill': {
                    WebkitBoxShadow: '0 0 0 1000px #FFF6F1 inset',
                    borderRadius: 2
                  }
                }}
              />
              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                sx={{
                  bgcolor: '#FFF6F1',
                  borderRadius: 2,
                  '& .MuiInputAdornment-root, & .MuiIconButton-root': { bgcolor: 'transparent' },
                  '& input:-webkit-autofill': {
                    WebkitBoxShadow: '0 0 0 1000px #FFF6F1 inset',
                    borderRadius: 2
                  }
                }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((prev) => !prev)}
                          edge="end"
                          size="small"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />

              <Button type="submit" variant="contained" fullWidth sx={{ mt: 3, py: 1.5, bgcolor: '#E26737', '&:hover': { bgcolor: '#d55b2f' }, borderRadius: 3 }}>
                Login
              </Button>
              <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#9EA4AB', mt: 2 }}>
                Forgot your password? Contact your Manager to have it reset.
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#9EA4AB', mt: 3 }}>
          Copyright registered @ IM Healthcare 2026
        </Typography>
      </motion.div>
    </Box>
  );
}
