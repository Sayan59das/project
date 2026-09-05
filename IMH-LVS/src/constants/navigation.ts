import { ModuleId } from '../auth/permissions';

export type NavItem = {
  label: string;
  path: string;
  icon: string;
  module?: ModuleId;
};

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'MdOutlineDashboard', module: 'dashboard' },
  { label: 'Products', path: '/products', icon: 'MdInventory2', module: 'products' },
  { label: 'Artwork', path: '/artwork', icon: 'MdBrush', module: 'artwork' },
  { label: 'Comparison', path: '/comparison', icon: 'MdCompareArrows', module: 'comparison' },
  { label: 'Approvals', path: '/approvals', icon: 'MdVerified', module: 'approvals' },
  { label: 'QA Verification', path: '/qa', icon: 'MdFactCheck', module: 'qa-verification' },
  { label: 'Reports', path: '/reports', icon: 'MdBarChart', module: 'reports' },
  { label: 'Masters', path: '/master-data', icon: 'MdStorage', module: 'masters' },
  { label: 'Users', path: '/users', icon: 'MdPeople', module: 'users' },
  { label: 'Settings', path: '/settings', icon: 'MdSettings', module: 'settings' },
  { label: 'Logout', path: '/login', icon: 'MdLogout' }
];
