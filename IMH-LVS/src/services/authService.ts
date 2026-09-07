// Signing in and out against the real API.
//
// This replaces src/auth/mockUsers.ts, which matched a hard-coded password
// against a list of emails in the bundle — i.e. every visitor could read the
// credential out of the JavaScript. The password is now checked server-side
// against a scrypt hash, and what comes back is an httpOnly cookie the page
// cannot read.
//
// The user record the API returns carries a role and any per-user module
// overrides; the ROLE -> permissions policy stays in src/auth/permissions.ts,
// which is the single source of it. The backend deliberately keeps no copy
// (see the backend's 003_user_module_access.sql), so assembling the two is
// this layer's job.

import { apiRequest } from './apiClient';
import { AppUser } from '../data/usersStore';
import { ModuleId, RoleId, UserPermissions, getDefaultPermissionsForRole } from '../auth/permissions';

/** The user shape the API returns — no permissions, overrides as a sparse map. */
type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  role: RoleId;
  department: string;
  status: AppUser['status'];
  createdDate: string;
  phone?: string;
  lastLogin?: string;
  moduleAccess?: Partial<Record<ModuleId, boolean>>;
};

/**
 * Applies a user's stored overrides on top of their role's defaults.
 *
 * Absence means "no override", not "no access" — a user nobody has customised
 * has no rows at all, and reading that as denied would lock every existing
 * user out of every page. That rule is stated in the migration that created
 * the table; this is the other half of it.
 */
function toAppUser(user: ApiUser): AppUser {
  const defaults = getDefaultPermissionsForRole(user.role);
  const permissions: UserPermissions = {
    modules: { ...defaults.modules, ...(user.moduleAccess ?? {}) },
    // actions are derived from the role and never stored — see the migration.
    actions: defaults.actions
  };

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    department: user.department,
    status: user.status,
    createdDate: user.createdDate,
    phone: user.phone,
    lastLogin: user.lastLogin,
    permissions
  };
}

export async function login(email: string, password: string): Promise<AppUser> {
  const { user } = await apiRequest<{ user: ApiUser }>('/auth/login', {
    method: 'POST',
    body: { email, password }
  });
  return toAppUser(user);
}

export async function logout(): Promise<void> {
  await apiRequest<{ signedOut: boolean }>('/auth/logout', { method: 'POST' });
}

/**
 * The signed-in user, or null.
 *
 * Null rather than a thrown error for a 401, because "nobody is signed in" is
 * the ordinary answer for a visitor loading the login page — not a failure to
 * report. Every other error is still thrown: a backend that is unreachable
 * must not be indistinguishable from a visitor who is simply signed out, or
 * the app silently shows a login form for a problem signing in cannot fix.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const { user } = await apiRequest<{ user: ApiUser }>('/auth/me');
    return toAppUser(user);
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status: number }).status === 401) return null;
    throw error;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest<{ passwordChanged: boolean }>('/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
}
