import { Box, Button, IconButton, InputBase, Menu, MenuItem, Paper, Tooltip, Typography, Divider } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdNotificationsNone, MdSearch, MdPersonOutline, MdKeyboardArrowDown, MdFileUpload, MdMenu, MdOutlineDarkMode, MdOutlineLightMode } from 'react-icons/md';
import dayjs from 'dayjs';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/permissions';
import { useColorMode } from '../theme/ColorModeContext';

type Props = {
  collapsed: boolean;
  onToggleSidebar: () => void;
};

export function Navbar({ collapsed, onToggleSidebar }: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { currentUser, hasModuleAccess, hasPermission, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();

  const handleLogout = () => {
    setAnchorEl(null);
    void logout();
    navigate('/login');
  };

  const canSearchProducts = hasModuleAccess('products');
  const canQuickUpload = hasModuleAccess('artwork') && hasPermission('UPLOAD');

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = searchTerm.trim();
    if (!term || !canSearchProducts) return;
    navigate(`/products?search=${encodeURIComponent(term)}`);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 2, bgcolor: 'var(--c-paper)', borderBottom: '1px solid var(--c-border)', minHeight: 80 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton sx={{ bgcolor: 'var(--c-tint-green-2)', color: 'var(--c-green)' }} onClick={onToggleSidebar}>
          <MdMenu size={22} />
        </IconButton>
        <Paper
          component="form"
          onSubmit={handleSearchSubmit}
          sx={{ display: 'flex', alignItems: 'center', width: 360, p: '8px 12px', borderRadius: 12, bgcolor: 'var(--c-tint-green)', border: '1px solid var(--c-border-green)' }}
        >
          <MdSearch size={18} color="var(--c-text-3)" />
          <InputBase
            sx={{ ml: 1.5, flex: 1, fontSize: 14 }}
            placeholder={canSearchProducts ? 'Search products by name, brand or company...' : 'Search'}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            disabled={!canSearchProducts}
          />
        </Paper>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
          {dayjs().format('dddd, MMM D')}
        </Typography>
        <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <IconButton
            onClick={toggleColorMode}
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            sx={{ bgcolor: 'var(--c-tint-green-2)', color: 'var(--c-green)', p: 0.5 }}
          >
            {mode === 'dark' ? <MdOutlineLightMode size={20} /> : <MdOutlineDarkMode size={20} />}
          </IconButton>
        </Tooltip>
        <IconButton sx={{ bgcolor: 'var(--c-tint-green-2)', color: 'var(--c-green)', p: 0.5 }}>
          <MdNotificationsNone size={20} />
        </IconButton>
        {canQuickUpload && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<MdFileUpload />}
            onClick={() => navigate('/artwork')}
            sx={{ borderRadius: 12, borderColor: 'var(--c-green)', color: 'var(--c-green)', px: 2, py: 0.6, fontSize: '0.875rem', textTransform: 'none' }}
          >
            Quick Upload
          </Button>
        )}
        <Paper sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '6px 10px', borderRadius: 12, bgcolor: 'var(--c-tint-green)', border: '1px solid var(--c-border-green-2)' }}>
          <MdPersonOutline size={20} color="var(--c-green-850)" />
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--c-green-850)', fontSize: '0.95rem' }}>
              {currentUser?.fullName ?? 'Guest'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--c-text-3)', fontSize: '0.75rem' }}>
              {currentUser ? ROLE_LABELS[currentUser.role] : ''}
            </Typography>
          </Box>
          <IconButton onClick={(event) => setAnchorEl(event.currentTarget)} sx={{ color: 'var(--c-green-850)', p: 0.5 }}>
            <MdKeyboardArrowDown size={18} />
          </IconButton>
        </Paper>
      </Box>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setAnchorEl(null); navigate('/profile'); }}>ðŸ‘¤ Profile</MenuItem>
        {hasModuleAccess('settings') && (
          <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings'); }}>âš™ï¸ Settings</MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleLogout}>ðŸšª Logout</MenuItem>
      </Menu>
    </Box>
  );
}
