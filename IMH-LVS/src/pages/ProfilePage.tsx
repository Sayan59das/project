import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Paper, Snackbar, TextField, Typography } from '@mui/material';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/permissions';
import { updateUser } from '../services/userService';
import { useInvalidateUserDirectory } from '../hooks/useUserDirectory';
import { formatDateTime } from '../utils/dateFormat';

// Matches the backend's rejectWeakPassword, so a password it will refuse is
// caught before the round trip. The server still checks — this is a courtesy,
// not the rule.
const MIN_PASSWORD_LENGTH = 10;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Lenient on purpose â€” digits, spaces, +, -, parentheses, 7-20 characters.
// Phone is optional, so an empty value is always valid.
function isValidPhone(phone: string): boolean {
  if (!phone.trim()) return true;
  return /^[0-9+\-\s()]{7,20}$/.test(phone.trim());
}

function formatLastLogin(value?: string): string {
  return value ? formatDateTime(value) : 'Never';
}

export function ProfilePage() {
  const { currentUser, refreshCurrentUser, changeOwnPassword } = useAuth();
  const invalidateUserDirectory = useInvalidateUserDirectory();

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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
    setSaveError(null);
  };

  const handleSave = async () => {
    const nextErrors: { name?: string; phone?: string } = {};
    if (!nameDraft.trim()) nextErrors.name = 'Name is required.';
    if (!isValidPhone(phoneDraft)) nextErrors.phone = 'Enter a valid phone number.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaveError(null);
    setIsSaving(true);
    try {
      await updateUser(currentUser.id, { fullName: nameDraft.trim(), phone: phoneDraft.trim() || undefined });
      // The header, the sidebar and every screen that puts a name to a user id
      // all read one of these two; a rename that updated only the profile page
      // would leave the old name on all of them until a reload.
      await refreshCurrentUser();
      invalidateUserDirectory();
      setEditing(false);
      setSuccessMessage('Profile updated successfully.');
    } catch (error) {
      // Stay in edit mode with the drafts intact: the edit did not happen, and
      // dropping what someone typed because the network failed makes them type
      // it twice.
      setSaveError(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);

    if (!currentPassword || !newPassword) {
      setPasswordError('Enter your current password and a new one.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new password entries do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('The new password must be different from the current one.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await changeOwnPassword(currentPassword, newPassword);
      if (!result.success) {
        // The backend's own wording: it distinguishes a wrong current password
        // from a new one it considers too weak, and those need different
        // things from the person reading it.
        setPasswordError(result.error);
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Changing a password ends every other session and reissues this one, so
      // the browser stays signed in and other devices do not. Worth saying —
      // otherwise someone discovers it on their phone an hour later.
      setSuccessMessage('Password changed. You have been signed out on other devices.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <Box>
      <PageHeader title="My Profile" subtitle="Manage your account information and preferences." />

      <Box sx={{ display: 'grid', gap: 3, maxWidth: 640 }}>
        <Card sx={{ borderRadius: 3, p: 3, bgcolor: 'var(--c-surface)' }}>
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
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--c-orange)' }}>
                {initialsFor(currentUser.fullName)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                {currentUser.fullName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mb: 0.5 }}>
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
              {saveError && <Alert severity="error">{saveError}</Alert>}
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  sx={{ bgcolor: 'var(--c-green)', '&:hover': { bgcolor: 'var(--c-green-600)' }, textTransform: 'none' }}
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gap: 2, maxWidth: 560 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
                  Full Name
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.fullName}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
                  Email
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.email}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
                  Role
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {ROLE_LABELS[currentUser.role]}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
                  Department
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.department}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
                  Phone
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {currentUser.phone || 'â€”'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
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
              <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
                User ID
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                {currentUser.id}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
                Created Date
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                {formatDateTime(currentUser.createdDate)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)' }}>
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
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mb: 2 }}>
            Changing your password signs you out everywhere else. This browser stays signed in.
          </Typography>

          <Box sx={{ display: 'grid', gap: 2, maxWidth: 420 }}>
            <TextField
              label="Current Password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              fullWidth
            />
            <TextField
              label="New Password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              fullWidth
            />
            <TextField
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              fullWidth
            />
            {passwordError && <Alert severity="error">{passwordError}</Alert>}
            <Button
              variant="contained"
              sx={{ textTransform: 'none', width: 200 }}
              onClick={() => void handleChangePassword()}
              disabled={isChangingPassword}
            >
              {isChangingPassword ? 'Changing…' : 'Change Password'}
            </Button>
          </Box>
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
