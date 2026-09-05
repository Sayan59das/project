import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Paper, Snackbar, TextField, Typography } from '@mui/material';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/permissions';
import { updateUser } from '../data/usersStore';
import { formatDateTime } from '../utils/dateFormat';

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Lenient on purpose — digits, spaces, +, -, parentheses, 7-20 characters.
// Phone is optional, so an empty value is always valid.
function isValidPhone(phone: string): boolean {
  if (!phone.trim()) return true;
  return /^[0-9+\-\s()]{7,20}$/.test(phone.trim());
}

function formatLastLogin(value?: string): string {
  return value ? formatDateTime(value) : 'Never';
}

export function ProfilePage() {
  const { currentUser, refreshCurrentUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!currentUser) {
    return (
      <Box>
        <PageHeader title="My Profile" subtitle="Manage your account information and preferences." />
        <Alert severity="error">Unable to load profile information.</Alert>
      </Box>
    );
  }

  const handleEdit = () => {
    setNameDraft(currentUser.fullName);
    setPhoneDraft(currentUser.phone ?? '');
    setErrors({});
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setErrors({});
  };

  const handleSave = () => {
    const nextErrors: { name?: string; phone?: string } = {};
    if (!nameDraft.trim()) nextErrors.name = 'Name is required.';
    if (!isValidPhone(phoneDraft)) nextErrors.phone = 'Enter a valid phone number.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    updateUser(currentUser.id, { fullName: nameDraft.trim(), phone: phoneDraft.trim() || undefined });
    refreshCurrentUser();
    setEditing(false);
    setSuccessMessage('Profile updated successfully.');
  };

  return (
    <Box>
      <PageHeader title="My Profile" subtitle="Manage your account information and preferences." />

      <Box sx={{ display: 'grid', gap: 3, maxWidth: 640 }}>
        <Card sx={{ borderRadius: 3, p: 3, bgcolor: '#EEF1F4' }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(226,103,55,0.14)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#E26737' }}>
                {initialsFor(currentUser.fullName)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                {currentUser.fullName}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9EA4AB', mb: 0.5 }}>
                {ROLE_LABELS[currentUser.role]}
              </Typography>
              <Chip
                label={currentUser.status}
                size="small"
                color={currentUser.status === 'Active' ? 'success' : 'default'}
                sx={{ fontWeight: 700 }}
              />
            </Box>
          </CardContent>
        </Card>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Profile Information
          </Typography>

          {editing ? (
            <Box sx={{ display: 'grid', gap: 2, maxWidth: 420 }}>
              <TextField
                label="Name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                error={Boolean(errors.name)}
                helperText={errors.name}
                fullWidth
              />
              <TextField
                label="Phone"
                value={phoneDraft}
                onChange={(event) => setPhoneDraft(event.target.value)}
                error={Boolean(errors.phone)}
                helperText={errors.phone}
                fullWidth
              />
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={handleCancel}>
                  Cancel
                </Button>
                <Button variant="contained" sx={{ bgcolor: '#00A651', '&:hover': { bgcolor: '#00913f' }, textTransform: 'none' }} onClick={handleSave}>
                  Save Changes
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gap: 2, maxWidth: 560 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Full Name
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.fullName}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Email
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.email}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Role
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {ROLE_LABELS[currentUser.role]}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Department
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.department}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Phone
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.phone || '—'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Status
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.status}
                </Typography>
              </Box>
              <Button variant="contained" sx={{ textTransform: 'none', width: 160 }} onClick={handleEdit}>
                Edit Profile
              </Button>
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Account Information
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, maxWidth: 560 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                User ID
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                {currentUser.id}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                Created Date
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                {formatDateTime(currentUser.createdDate)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                Last Login
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                {formatLastLogin(currentUser.lastLogin)}
              </Typography>
            </Box>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Password
          </Typography>
          <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
            Password management isn&apos;t available in this prototype — sign-in currently uses a shared demo credential for every
            account rather than a per-user password. This section will become active once real per-user authentication is
            implemented.
          </Typography>
        </Paper>
      </Box>

      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ fontWeight: 700 }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
