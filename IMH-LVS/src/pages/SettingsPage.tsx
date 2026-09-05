import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Snackbar,
  Switch,
  Typography
} from '@mui/material';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthContext';
import { navItems } from '../constants/navigation';
import { AppSettings, getSettings, resetSettings, updateSettings } from '../services/settingsService';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function SettingsPage() {
  const { currentUser, hasModuleAccess } = useAuth();
  const userId = currentUser?.id ?? '';

  const [saved, setSaved] = useState<AppSettings>(() => getSettings(userId));
  const [draft, setDraft] = useState<AppSettings>(saved);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(saved);

  // Only routes the current user can actually land on.
  const landingPageOptions = useMemo(
    () => navItems.filter((item) => item.module && item.module !== 'settings' && hasModuleAccess(item.module)),
    [hasModuleAccess]
  );

  // Catches an accidental tab close/reload with unsaved changes. In-app
  // route-change blocking isn't available without moving this app onto a
  // data router, which is out of scope here — this is the lightweight
  // equivalent the task calls for.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  if (!currentUser) {
    return (
      <Box>
        <PageHeader title="Settings" subtitle="Manage your application preferences." />
        <Alert severity="error">Unable to load your settings.</Alert>
      </Box>
    );
  }

  const updateDraft = (patch: Partial<AppSettings>) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleLandingPageChange = (event: SelectChangeEvent) => updateDraft({ defaultLandingPage: event.target.value });
  const handlePageSizeChange = (event: SelectChangeEvent) => updateDraft({ pageSize: Number(event.target.value) });

  const handleSave = () => {
    const updated = updateSettings(currentUser.id, draft);
    setSaved(updated);
    setDraft(updated);
    setSuccessMessage('Settings saved successfully.');
  };

  const handleDiscard = () => setDraft(saved);

  const performReset = () => {
    const defaults = resetSettings(currentUser.id);
    setSaved(defaults);
    setDraft(defaults);
    setResetDialogOpen(false);
    setSuccessMessage('Settings restored to default values.');
  };

  const handleResetClick = () => {
    if (saved.confirmDestructiveActions) {
      setResetDialogOpen(true);
    } else {
      performReset();
    }
  };

  return (
    <Box>
      <PageHeader title="Settings" subtitle="Manage your application preferences." />

      <Box sx={{ display: 'grid', gap: 3, maxWidth: 640 }}>
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            General
          </Typography>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Default Landing Page</InputLabel>
              <Select value={draft.defaultLandingPage} label="Default Landing Page" onChange={handleLandingPageChange}>
                {landingPageOptions.map((item) => (
                  <MenuItem key={item.path} value={item.path}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Rows per page</InputLabel>
              <Select value={String(draft.pageSize)} label="Rows per page" onChange={handlePageSizeChange}>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <MenuItem key={size} value={size}>
                    {size}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={draft.confirmDestructiveActions}
                  onChange={(event) => updateDraft({ confirmDestructiveActions: event.target.checked })}
                />
              }
              label="Confirm before destructive actions"
            />
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Notifications
          </Typography>
          <Typography variant="body2" sx={{ color: '#9EA4AB', mb: 2 }}>
            These preferences are saved for when email/in-app delivery is implemented — no notifications are sent yet in this
            prototype.
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch checked={draft.approvalNotifications} onChange={(event) => updateDraft({ approvalNotifications: event.target.checked })} />
              }
              label="Approval notifications"
            />
            <FormControlLabel
              control={
                <Switch checked={draft.revisionNotifications} onChange={(event) => updateDraft({ revisionNotifications: event.target.checked })} />
              }
              label="Revision notifications"
            />
            <FormControlLabel
              control={
                <Switch checked={draft.artworkNotifications} onChange={(event) => updateDraft({ artworkNotifications: event.target.checked })} />
              }
              label="Artwork notifications"
            />
            <FormControlLabel
              control={
                <Switch checked={draft.systemNotifications} onChange={(event) => updateDraft({ systemNotifications: event.target.checked })} />
              }
              label="System notifications"
            />
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          {hasUnsavedChanges && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body2" sx={{ color: '#B26A00', fontWeight: 700 }}>
                  Unsaved changes
                </Typography>
                <Button size="small" sx={{ textTransform: 'none', color: '#9EA4AB' }} onClick={handleDiscard}>
                  Discard changes
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />
            </>
          )}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" sx={{ borderColor: '#D8DDE3', color: '#9EA4AB', textTransform: 'none' }} onClick={handleResetClick}>
              Reset to Defaults
            </Button>
            <Button
              variant="contained"
              sx={{ bgcolor: '#00A651', '&:hover': { bgcolor: '#00913f' }, textTransform: 'none' }}
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
            >
              Save Changes
            </Button>
          </Box>
        </Paper>
      </Box>

      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Reset settings to defaults?</DialogTitle>
        <DialogContent>
          <DialogContentText>This restores every preference on this page to its default value. This cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={() => setResetDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={performReset}>
            Reset to Defaults
          </Button>
        </DialogActions>
      </Dialog>

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
