import { Box } from '@mui/material';
import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Navbar } from '../components/Navbar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        bgcolor: 'var(--c-bg)',
        backgroundImage: 'radial-gradient(circle at top left, rgba(226,103,55,0.10), transparent 30%), radial-gradient(circle at bottom right, rgba(0,166,81,0.10), transparent 28%)'
      }}
    >
      <Sidebar collapsed={sidebarCollapsed} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', ml: { xs: 0, md: sidebarCollapsed ? '80px' : '220px' }, height: '100%', overflow: 'hidden' }}>
        <Navbar collapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)} />
        <Box sx={{ p: 3, flex: 1, overflowY: 'auto' }}>{children}</Box>
      </Box>
    </Box>
  );
}
