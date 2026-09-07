import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MdVisibility, MdVisibilityOff, MdOutlineDarkMode, MdOutlineLightMode } from 'react-icons/md';
import illustration from '../assets/label-verification-illustration.png';
import { useColorMode } from '../theme/ColorModeContext';
import { useAuth } from '../auth/AuthContext';
import { getUserByEmail } from '../data/usersStore';
import { getSettings } from '../services/settingsService';

export function LoginPage() {
  const { login } = useAuth();
  const { mode, toggleColorMode } = useColorMode();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Signing in is a round trip now rather than a localStorage lookup, so the
  // button has to report that it is working — without the pending state a slow
  // or unreachable backend looks exactly like a click that did nothing, and
  // people click again.
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSigningIn(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const user = getUserByEmail(email);
      navigate(user ? getSettings(user.id).defaultLandingPage : '/dashboard');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'var(--c-tint-orange-4)', overflow: 'hidden' }}>
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
          // The illustration is a bright, near-white artwork. At 0.4 it reads
          // as a soft wash on the light background, but over the dark one it
          // lifts the whole page into a muddy grey — the opposite of what
          // dark mode is for. Drop it to a faint texture instead.
          opacity: mode === 'dark' ? 0.13 : 0.4,
          pointerEvents: 'none'
        }}
      />

      {/* The login screen sits outside AppLayout, so it has no Navbar to host
          the theme switch — it gets its own, otherwise the first screen a user
          ever sees would be stuck in whichever mode they last chose. */}
      <IconButton
        onClick={toggleColorMode}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        sx={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 2,
          bgcolor: 'var(--c-paper)',
          color: 'var(--c-text-2)',
          border: '1px solid var(--c-border)',
          '&:hover': { bgcolor: 'var(--c-surface)' }
        }}
      >
        {mode === 'dark' ? <MdOutlineLightMode size={20} /> : <MdOutlineDarkMode size={20} />}
      </IconButton>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} style={{ position: 'relative', zIndex: 1 }}>
        <Card sx={{ width: 420, borderRadius: '20px', boxShadow: '0 26px 90px rgba(226,103,55,0.18)', bgcolor: 'var(--c-paper)', position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'radial-gradient(circle at top left, rgba(226,103,55,0.08), transparent 42%)', pointerEvents: 'none' }} />
          <CardContent sx={{ position: 'relative', zIndex: 1, p: 5 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'var(--c-orange)', mb: 1 }}>
              Welcome to IMH LVS
            </Typography>
            <Typography variant="body1" sx={{ color: 'var(--c-text-3)', mb: 4, lineHeight: 1.7 }}>
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
                  bgcolor: 'var(--c-tint-orange-2)',
                  borderRadius: 2,
                  '& input:-webkit-autofill': {
                    WebkitBoxShadow: '0 0 0 1000px var(--c-tint-orange-2) inset',
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
                  bgcolor: 'var(--c-tint-orange-2)',
                  borderRadius: 2,
                  '& .MuiInputAdornment-root, & .MuiIconButton-root': { bgcolor: 'transparent' },
                  '& input:-webkit-autofill': {
                    WebkitBoxShadow: '0 0 0 1000px var(--c-tint-orange-2) inset',
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

              <Button type="submit" variant="contained" fullWidth disabled={isSigningIn} sx={{ mt: 3, py: 1.5, bgcolor: 'var(--c-orange)', '&:hover': { bgcolor: 'var(--c-orange-600)' }, borderRadius: 3 }}>
                {isSigningIn ? 'Signing in…' : 'Login'}
              </Button>
              <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'var(--c-text-3)', mt: 2 }}>
                Forgot your password? Contact your Manager to have it reset.
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'var(--c-text-3)', mt: 3 }}>
          Copyright registered @ IM Healthcare 2026
        </Typography>
      </motion.div>
    </Box>
  );
}
