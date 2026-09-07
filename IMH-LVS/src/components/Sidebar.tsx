import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as Icons from 'react-icons/md';
import { navItems } from '../constants/navigation';
import { useAuth } from '../auth/AuthContext';
import logo from '../assets/logo_img.png';
import sidebarGummy from '../assets/sidebar-image.png';

type Props = {
  collapsed: boolean;
};

export function Sidebar({ collapsed }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasModuleAccess, logout } = useAuth();

  const visibleItems = navItems.filter((item) => !item.module || hasModuleAccess(item.module));

  return (
    <Box
      sx={{
        position: { xs: 'relative', md: 'fixed' },
        top: 0,
        left: 0,
        width: { xs: '100%', md: collapsed ? 80 : 220 },
        minWidth: { md: collapsed ? 80 : 220 },
        height: { xs: 'auto', md: '100vh' },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bgcolor: 'var(--c-tint-green-4)',
        color: 'var(--c-green-900)',
        px: { xs: 2, md: 1 },
        py: { xs: 2, md: 3 },
        boxShadow: { xs: 'none', md: '2px 0 18px rgba(0, 0, 0, 0.06)' },
        zIndex: 20,
        overflow: 'hidden'
      }}
    >
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box component="img" src={logo} alt="IMH logo" sx={{ width: collapsed ? 44 : 64, height: 'auto', objectFit: 'contain', mb: 2 }} />

        <List disablePadding sx={{ width: '100%' }}>
          {visibleItems.map((item) => {
            const Icon = (Icons as any)[item.icon];
            const isLogout = item.label === 'Logout';
            const selected = !isLogout && location.pathname === item.path;

            return (
              <ListItemButton
                {...(isLogout
                  ? { onClick: () => { void logout().finally(() => navigate('/login')); } }
                  : { component: Link, to: item.path })}
                key={item.label}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: collapsed ? 0 : 1,
                  mb: 0.5,
                  py: 0.9,
                  px: collapsed ? 0 : 1,
                  borderRadius: 2,
                  bgcolor: selected ? 'var(--c-green)' : 'transparent',
                  color: selected ? 'var(--c-paper)' : 'var(--c-green-900)',
                  textTransform: 'none',
                  fontSize: 13,
                  minHeight: 40,
                  '&:hover': { bgcolor: selected ? 'var(--c-green)' : 'var(--c-action-hover)' }
                }}
              >
                <ListItemIcon sx={{ color: selected ? 'var(--c-paper)' : 'var(--c-green)', minWidth: 34, justifyContent: 'center' }}>
                  {Icon && <Icon size={18} />}
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography sx={{ fontWeight: selected ? 700 : 600, color: selected ? 'var(--c-paper)' : 'var(--c-green-900)', fontSize: 13 }}>
                        {item.label}
                      </Typography>
                    }
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      {!collapsed && (
        <Box
          sx={{
            width: '100%',
            mt: 'auto',
            pt: 2,
            borderRadius: 4,
            background: 'linear-gradient(180deg, var(--c-tint-green-3) 0%, var(--c-border-green-4) 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            px: 2,
            py: 2.5
          }}
        >
          <Box component="img" src={sidebarGummy} alt="" sx={{ width: 108, height: 'auto', mb: 1 }} />
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'var(--c-green-900)', letterSpacing: 0.3 }}>
            Your Nutrition Ally
          </Typography>
        </Box>
      )}
    </Box>
  );
}
