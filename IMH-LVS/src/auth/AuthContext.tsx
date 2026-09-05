import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { ActionId, ModuleId, RoleId } from './permissions';
import { verifyMockCredentials } from './mockUsers';
import { AppUser, getUserByEmail, updateUser } from '../data/usersStore';

const SESSION_KEY = 'imh_lvs_session_email';

// Resolved synchronously (not in an effect) so the very first render already
// reflects the restored session. Without this, ProtectedRoute would see
// isAuthenticated=false for one render on every direct URL load/refresh and
// bounce through /login before the real destination ever shows.
function restoreSessionUser(): AppUser | null {
  const sessionEmail = localStorage.getItem(SESSION_KEY);
  if (!sessionEmail) return null;
  const user = getUserByEmail(sessionEmail);
  if (user && user.status === 'Active') return user;
  localStorage.removeItem(SESSION_KEY);
  return null;
}

export type LoginResult = { success: true } | { success: false; error: string };

type AuthContextValue = {
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => LoginResult;
  logout: () => void;
  hasRole: (role: RoleId) => boolean;
  hasPermission: (action: ActionId) => boolean;
  hasModuleAccess: (moduleId: ModuleId) => boolean;
  refreshCurrentUser: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(restoreSessionUser);

  const login = (email: string, password: string): LoginResult => {
    if (!verifyMockCredentials(email, password)) {
      return { success: false, error: 'Invalid email or password.' };
    }
    const user = getUserByEmail(email);
    if (!user) {
      return { success: false, error: 'No user profile found for this account.' };
    }
    if (user.status !== 'Active') {
      return { success: false, error: 'This account is not active. Contact your administrator.' };
    }
    localStorage.setItem(SESSION_KEY, user.email);
    const withLastLogin = updateUser(user.id, { lastLogin: new Date().toISOString() }) ?? user;
    setCurrentUser(withLastLogin);
    return { success: true };
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  };

  const refreshCurrentUser = () => {
    if (!currentUser) return;
    const refreshed = getUserByEmail(currentUser.email);
    if (refreshed) setCurrentUser(refreshed);
  };

  const hasRole = (role: RoleId) => currentUser?.role === role;

  const hasPermission = (action: ActionId) => Boolean(currentUser?.permissions.actions.includes(action));

  const hasModuleAccess = (moduleId: ModuleId) => Boolean(currentUser?.permissions.modules[moduleId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isAuthenticated: currentUser !== null,
      login,
      logout,
      hasRole,
      hasPermission,
      hasModuleAccess,
      refreshCurrentUser
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
