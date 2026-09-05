import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { MdClose, MdSearch } from 'react-icons/md';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { MODULES, ModuleId, ROLES, ROLE_LABELS, RoleId, getDefaultPermissionsForRole } from '../auth/permissions';
import { AppUser, UserStatus, createUser, getUserByEmail, getUsers, updateUser } from '../data/usersStore';
import { formatDateTime } from '../utils/dateFormat';

const STATUS_OPTIONS: UserStatus[] = ['Active', 'Inactive', 'Pending', 'Restricted'];

type FormState = {
  fullName: string;
  email: string;
  role: RoleId;
  department: string;
  status: UserStatus;
  moduleAccess: Record<ModuleId, boolean>;
};

function emptyForm(): FormState {
  return {
    fullName: '',
    email: '',
    role: ROLES[0].id,
    department: '',
    status: 'Active',
    moduleAccess: getDefaultPermissionsForRole(ROLES[0].id).modules
  };
}

export function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>(() => getUsers());
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleId | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [formState, setFormState] = useState<FormState>(emptyForm());
  const [formErrors, setFormErrors] = useState<{ fullName?: string; email?: string }>({});
  const [deactivateTarget, setDeactivateTarget] = useState<AppUser | null>(null);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !term || user.fullName.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === 'Active').length,
      pending: users.filter((u) => u.status === 'Pending').length,
      inactive: users.filter((u) => u.status === 'Inactive' || u.status === 'Restricted').length
    }),
    [users]
  );

  const handleOpenAdd = () => {
    setEditingUserId(null);
    setFormState(emptyForm());
    setFormErrors({});
    setDrawerOpen(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setEditingUserId(user.id);
    setFormState({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: user.department,
      status: user.status,
      moduleAccess: { ...user.permissions.modules }
    });
    setFormErrors({});
    setDetailOpen(false);
    setDrawerOpen(true);
  };

  const handleOpenDetails = (user: AppUser) => {
    setSelectedUser(user);
    setDetailOpen(true);
  };

  const handleClose = () => {
    setDrawerOpen(false);
    setDetailOpen(false);
  };

  const handleTextChange = (field: 'fullName' | 'email' | 'department') => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleRoleChange = (event: SelectChangeEvent) => {
    const role = event.target.value as RoleId;
    setFormState((prev) => ({ ...prev, role, moduleAccess: getDefaultPermissionsForRole(role).modules }));
  };

  const handleStatusChange = (event: SelectChangeEvent) => {
    setFormState((prev) => ({ ...prev, status: event.target.value as UserStatus }));
  };

  const handleModuleToggle = (moduleId: ModuleId) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, moduleAccess: { ...prev.moduleAccess, [moduleId]: event.target.checked } }));
  };

  const validate = (): boolean => {
    const errors: { fullName?: string; email?: string } = {};
    const email = formState.email.trim();
    if (!formState.fullName.trim()) errors.fullName = 'Full Name is required.';
    if (!email) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address.';
    } else {
      const existing = getUserByEmail(email);
      if (existing && existing.id !== editingUserId) errors.email = 'A user with this email already exists.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const permissions = {
      modules: formState.moduleAccess,
      actions: getDefaultPermissionsForRole(formState.role).actions
    };

    if (editingUserId) {
      updateUser(editingUserId, {
        fullName: formState.fullName,
        email: formState.email,
        role: formState.role,
        department: formState.department,
        status: formState.status,
        permissions
      });
    } else {
      createUser({
        fullName: formState.fullName,
        email: formState.email,
        role: formState.role,
        department: formState.department,
        status: formState.status,
        permissions
      });
    }

    setUsers(getUsers());
    handleClose();
  };

  const applyStatusToggle = (user: AppUser) => {
    updateUser(user.id, { status: user.status === 'Active' ? 'Inactive' : 'Active' });
    const refreshed = getUsers();
    setUsers(refreshed);
    setSelectedUser(refreshed.find((u) => u.id === user.id) ?? null);
  };

  // Deactivating a user removes their access, so it goes through a
  // confirmation step; reactivating does not need one.
  const handleToggleActive = (user: AppUser) => {
    if (user.status === 'Active') {
      setDeactivateTarget(user);
    } else {
      applyStatusToggle(user);
    }
  };

  const handleConfirmDeactivateUser = () => {
    if (!deactivateTarget) return;
    applyStatusToggle(deactivateTarget);
    setDeactivateTarget(null);
  };

  return (
    <Box>
      <PageHeader title="Users" subtitle="Manage system users and their access permissions." />

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2, width: '100%' }}>
            <Card sx={{ borderRadius: 14 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Total Users
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {stats.total}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ borderRadius: 14 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Active
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {stats.active}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ borderRadius: 14 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Pending
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {stats.pending}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ borderRadius: 14 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                  Inactive
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {stats.inactive}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            User Directory
          </Typography>
          <Button variant="contained" sx={{ textTransform: 'none' }} onClick={handleOpenAdd}>
            + Add User
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
          <TextField
            size="small"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ minWidth: 260 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <MdSearch size={18} />
                  </InputAdornment>
                )
              }
            }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Role</InputLabel>
            <Select value={roleFilter} label="Role" onChange={(event) => setRoleFilter(event.target.value as RoleId | 'all')}>
              <MenuItem value="all">All Roles</MenuItem>
              {ROLES.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(event) => setStatusFilter(event.target.value as UserStatus | 'all')}>
              <MenuItem value="all">All Statuses</MenuItem>
              {STATUS_OPTIONS.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>User ID</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Created Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} hover sx={{ '&:hover': { bgcolor: '#EEF1F4' } }}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.fullName}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                  <TableCell>{user.department}</TableCell>
                  <TableCell>
                    <StatusChip status={user.status} />
                  </TableCell>
                  <TableCell>{formatDateTime(user.createdDate)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Button variant="text" size="small" sx={{ textTransform: 'none' }} onClick={() => handleOpenDetails(user)}>
                        View
                      </Button>
                      <Button variant="text" size="small" sx={{ textTransform: 'none' }} onClick={() => handleOpenEdit(user)}>
                        Edit
                      </Button>
                      <Button
                        variant="text"
                        size="small"
                        color={user.status === 'Active' ? 'error' : 'success'}
                        sx={{ textTransform: 'none' }}
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" sx={{ color: '#9EA4AB', textAlign: 'center', py: 3 }}>
                      No users match the current filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Drawer anchor="right" open={drawerOpen} onClose={handleClose}>
        <Box sx={{ width: { xs: 320, sm: 440 }, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {editingUserId ? 'Edit User' : 'Add New User'}
            </Typography>
            <IconButton onClick={handleClose}>
              <MdClose />
            </IconButton>
          </Box>

          <Stack spacing={2}>
            <TextField
              label="Full Name"
              value={formState.fullName}
              onChange={handleTextChange('fullName')}
              error={Boolean(formErrors.fullName)}
              helperText={formErrors.fullName}
            />
            <TextField
              label="Email"
              value={formState.email}
              onChange={handleTextChange('email')}
              error={Boolean(formErrors.email)}
              helperText={formErrors.email}
            />
            <FormControl>
              <InputLabel>Role</InputLabel>
              <Select value={formState.role} label="Role" onChange={handleRoleChange}>
                {ROLES.map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    {role.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Department" value={formState.department} onChange={handleTextChange('department')} />
            <FormControl>
              <InputLabel>Status</InputLabel>
              <Select value={formState.status} label="Status" onChange={handleStatusChange}>
                {STATUS_OPTIONS.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Module Access
          </Typography>
          <Typography variant="body2" sx={{ color: '#9EA4AB', mb: 1.5 }}>
            Defaults are set from the selected role. Customize below if this user needs different access.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.5 }}>
            {MODULES.map((module) => (
              <FormControlLabel
                key={module.id}
                control={<Checkbox checked={formState.moduleAccess[module.id]} onChange={handleModuleToggle(module.id)} />}
                label={module.label}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 4 }}>
            <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button variant="contained" sx={{ textTransform: 'none' }} onClick={handleSave}>
              {editingUserId ? 'Save Changes' : 'Create User'}
            </Button>
          </Box>
        </Box>
      </Drawer>

      <Drawer anchor="right" open={detailOpen} onClose={handleClose}>
        <Box sx={{ width: { xs: 320, sm: 420 }, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              User Details
            </Typography>
            <IconButton onClick={handleClose}>
              <MdClose />
            </IconButton>
          </Box>

          {selectedUser && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Paper sx={{ p: 3, borderRadius: 3, bgcolor: '#EEF1F4' }}>
                <Typography variant="subtitle2" sx={{ color: '#6B7177', mb: 1 }}>
                  {selectedUser.fullName}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  {ROLE_LABELS[selectedUser.role]}
                </Typography>
                <StatusChip status={selectedUser.status} />
              </Paper>

              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177', mb: 1, fontWeight: 700 }}>
                  Contact Information
                </Typography>
                <Typography variant="body2">Email: {selectedUser.email}</Typography>
                <Typography variant="body2">Department: {selectedUser.department}</Typography>
                <Typography variant="body2">Created: {formatDateTime(selectedUser.createdDate)}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6B7177', mb: 1, fontWeight: 700 }}>
                  Module Access
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.5 }}>
                  {MODULES.map((module) => (
                    <Typography key={module.id} variant="body2" sx={{ color: selectedUser.permissions.modules[module.id] ? '#0B3926' : '#D8DDE3' }}>
                      {selectedUser.permissions.modules[module.id] ? '✓' : '✕'} {module.label}
                    </Typography>
                  ))}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={() => handleOpenEdit(selectedUser)}>
                  Edit User
                </Button>
                <Button
                  variant="contained"
                  color={selectedUser.status === 'Active' ? 'error' : 'success'}
                  sx={{ textTransform: 'none' }}
                  onClick={() => handleToggleActive(selectedUser)}
                >
                  {selectedUser.status === 'Active' ? 'Deactivate User' : 'Activate User'}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Drawer>

      <Dialog open={Boolean(deactivateTarget)} onClose={() => setDeactivateTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Deactivate User</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
            Are you sure you want to deactivate this user? They will lose access to the system.
          </Typography>
          {deactivateTarget && (
            <Typography variant="body2" sx={{ fontWeight: 700, mt: 1.5 }}>
              {deactivateTarget.fullName} ({deactivateTarget.id})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDeactivateTarget(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={handleConfirmDeactivateUser}>
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
