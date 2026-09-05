import { Box, Button, IconButton, InputBase, Menu, MenuItem, Paper, Typography, Divider } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdNotificationsNone, MdSearch, MdPersonOutline, MdKeyboardArrowDown, MdFileUpload, MdMenu } from 'react-icons/md';
import dayjs from 'dayjs';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/permissions';

type Props = {
  collapsed: boolean;
  onToggleSidebar: () => void;
};

export function Navbar({ collapsed, onToggleSidebar }: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { currentUser, hasModuleAccess, hasPermission, logout } = useAuth();

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
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
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 2, bgcolor: '#FFFFFF', borderBottom: '1px solid #D8DDE3', minHeight: 80 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton sx={{ bgcolor: '#F8FFF9', color: '#00A651' }} onClick={onToggleSidebar}>
          <MdMenu size={22} />
        </IconButton>
        <Paper
          component="form"
          onSubmit={handleSearchSubmit}
          sx={{ display: 'flex', alignItems: 'center', width: 360, p: '8px 12px', borderRadius: 12, bgcolor: '#F6F9F3', border: '1px solid #EAEFE7' }}
        >
          <MdSearch size={18} color="#9EA4AB" />
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
        <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
          {dayjs().format('dddd, MMM D')}
        </Typography>
        <IconButton sx={{ bgcolor: '#F8FFF9', color: '#00A651', p: 0.5 }}>
          <MdNotificationsNone size={20} />
        </IconButton>
        {canQuickUpload && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<MdFileUpload />}
            onClick={() => navigate('/artwork')}
            sx={{ borderRadius: 12, borderColor: '#00A651', color: '#00A651', px: 2, py: 0.6, fontSize: '0.875rem', textTransform: 'none' }}
          >
            Quick Upload
          </Button>
        )}
        <Paper sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '6px 10px', borderRadius: 12, bgcolor: '#F6F9F3', border: '1px solid #E9F0E6' }}>
          <MdPersonOutline size={20} color="#15432D" />
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#15432D', fontSize: '0.95rem' }}>
              {currentUser?.fullName ?? 'Guest'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#9EA4AB', fontSize: '0.75rem' }}>
              {currentUser ? ROLE_LABELS[currentUser.role] : ''}
            </Typography>
          </Box>
          <IconButton onClick={(event) => setAnchorEl(event.currentTarget)} sx={{ color: '#15432D', p: 0.5 }}>
            <MdKeyboardArrowDown size={18} />
          </IconButton>
        </Paper>
      </Box>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setAnchorEl(null); navigate('/profile'); }}>👤 Profile</MenuItem>
        {hasModuleAccess('settings') && (
          <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings'); }}>⚙️ Settings</MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleLogout}>🚪 Logout</MenuItem>
      </Menu>
    </Box>
  );
}
