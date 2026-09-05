import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
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
  const { isAuthenticated, hasModuleAccess } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const allowed = !moduleId || hasModuleAccess(moduleId);

  return <AppLayout>{allowed ? children : <AccessRestrictedPage />}</AppLayout>;
}
