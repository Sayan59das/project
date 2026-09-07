import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './AuthContext';
import { ModuleId } from './permissions';
import { AppLayout } from '../layouts/AppLayout';
import { AccessRestrictedPage } from '../pages/AccessRestrictedPage';

type Props = {
  children: ReactNode;
  moduleId?: ModuleId;
};

// Wraps a page with auth + module-level access checks and the shared
// AppLayout (sidebar/navbar). Centralizing this here means individual
// pages never need to know about roles or permissions.
export function ProtectedRoute({ children, moduleId }: Props) {
  const { isAuthenticated, isRestoringSession, hasModuleAccess } = useAuth();

  // The session lives in an httpOnly cookie, so whether anybody is signed in
  // is not known until /auth/me answers. Redirecting during that window would
  // bounce every direct URL load and every refresh through /login before the
  // real destination could show — the same first-render problem the previous
  // localStorage implementation avoided by being synchronous.
  if (isRestoringSession) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Restoring your session" />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const allowed = !moduleId || hasModuleAccess(moduleId);

  return <AppLayout>{allowed ? children : <AccessRestrictedPage />}</AppLayout>;
}
