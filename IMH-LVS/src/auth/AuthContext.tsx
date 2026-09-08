import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActionId, ModuleId, RoleId } from './permissions';
import { AppUser } from '../types/user';
import { ApiError } from '../services/apiClient';
import { changePassword, getCurrentUser, login as loginRequest, logout as logoutRequest } from '../services/authService';

// Login hands the signed-in user back rather than only a flag: the caller's
// next move is to look up that person's default landing page, and it used to
// do it by re-reading the directory by email. There is no synchronous
// directory any more, and the login response already carries the user.
export type LoginResult = { success: true; user: AppUser } | { success: false; error: string };

/** For calls whose only interesting outcome is "worked" or "here is why not". */
export type ActionResult = { success: true } | { success: false; error: string };

type AuthContextValue = {
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  /**
   * True until the first /auth/me has answered.
   *
   * This exists because the session moved out of localStorage. It used to be
   * readable synchronously, so the very first render already knew whether
   * anybody was signed in; now it takes a round trip, and anything that
   * decides based on isAuthenticated before that answer arrives decides on a
   * false negative — which is a redirect to /login on every page refresh.
   * ProtectedRoute waits on this.
   */
  isRestoringSession: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<ActionResult>;
  hasRole: (role: RoleId) => boolean;
  hasPermission: (action: ActionId) => boolean;
  hasModuleAccess: (moduleId: ModuleId) => boolean;
  refreshCurrentUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // The session is an httpOnly cookie, so the page cannot read it and has to
  // ask who it belongs to. A 401 here is the ordinary "not signed in" answer
  // and getCurrentUser returns null for it; anything else is a real problem
  // and is logged rather than swallowed, because a backend that is down must
  // not look exactly like a visitor who is signed out.
  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('[auth] Could not restore the session:', error instanceof Error ? error.message : error);
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const user = await loginRequest(email, password);
      setCurrentUser(user);
      return { success: true, user };
    } catch (error) {
      // The backend's own message is shown as written: it distinguishes a
      // wrong credential ('Invalid email or password.') from an account that
      // is not active, and the second one tells somebody to raise a ticket
      // rather than retype a password they know is right.
      return { success: false, error: messageFor(error, 'Could not sign in.') };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      // Signing out locally has to happen whether or not the server was
      // reachable — leaving somebody looking at an authenticated UI because
      // the network blipped is the worse failure of the two.
      console.error('[auth] Sign-out request failed:', error instanceof Error ? error.message : error);
    } finally {
      setCurrentUser(null);
    }
  }, []);

  const changeOwnPassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<ActionResult> => {
      try {
        await changePassword(currentPassword, newPassword);
        return { success: true };
      } catch (error) {
        return { success: false, error: messageFor(error, 'Could not change the password.') };
      }
    },
    []
  );

  const refreshCurrentUser = useCallback(async () => {
    try {
      setCurrentUser(await getCurrentUser());
    } catch (error) {
      console.error('[auth] Could not refresh the current user:', error instanceof Error ? error.message : error);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isAuthenticated: currentUser !== null,
      isRestoringSession,
      login,
      logout,
      changeOwnPassword,
      hasRole: (role: RoleId) => currentUser?.role === role,
      hasPermission: (action: ActionId) => Boolean(currentUser?.permissions.actions.includes(action)),
      hasModuleAccess: (moduleId: ModuleId) => Boolean(currentUser?.permissions.modules[moduleId]),
      refreshCurrentUser
    }),
    [currentUser, isRestoringSession, login, logout, changeOwnPassword, refreshCurrentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
