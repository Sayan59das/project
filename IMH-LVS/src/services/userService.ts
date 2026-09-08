// The user directory, against the real API.
//
// This replaces data/usersStore.ts, which kept the directory in localStorage:
// every browser had its own five seed users, a Manager's edits were invisible
// to everyone else, and an approval trail recorded a user id that only existed
// on the machine that wrote it. The rows now come from the `users` table, so
// two people looking at Users see the same directory.
//
// PERMISSIONS ARE ASSEMBLED HERE, not fetched. The backend stores a user's
// module overrides and nothing else — no actions, no role policy — because a
// stored copy of ROLE_ACTIONS goes stale the moment auth/permissions.ts
// changes. toAppUser is the one place the two halves are put back together,
// and authService uses it too so a user who arrives by signing in is identical
// to the same user read out of the directory.

import { apiRequest, findOne } from './apiClient';
import { AppUser, UserStatus } from '../types/user';
import { ModuleId, RoleId, UserPermissions, getDefaultPermissionsForRole } from '../auth/permissions';

/** The user shape the API returns: no permissions, overrides as a sparse map. */
export type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  role: RoleId;
  department: string;
  status: UserStatus;
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
export function toAppUser(user: ApiUser): AppUser {
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

/**
 * The reverse: which module flags to send when saving a user.
 *
 * The whole sheet, always. PATCH /users/:id replaces a user's overrides with
 * exactly what it is given, which is how a Manager unticking a box actually
 * removes the override — sending only the ticked ones would make unticking
 * indistinguishable from not mentioning the module.
 */
function toModuleAccess(permissions: UserPermissions): Partial<Record<ModuleId, boolean>> {
  return { ...permissions.modules };
}

export type UserInput = {
  fullName: string;
  email: string;
  role: RoleId;
  department: string;
  status: UserStatus;
  phone?: string;
  /** Optional: omitted on create, where the role's defaults are the point. */
  permissions?: UserPermissions;
};

export async function getUsers(): Promise<AppUser[]> {
  const users = await apiRequest<ApiUser[]>('/users');
  return users.map(toAppUser);
}

export async function getUserById(id: string): Promise<AppUser | undefined> {
  // findOne, not a blanket catch: a 404 is an ordinary answer here — an
  // approval row can name a user who has since been removed, and callers
  // render "Unknown User" for it — while a 401 or an outage must not be
  // reported as "no such user".
  const user = await findOne(apiRequest<ApiUser>(`/users/${encodeURIComponent(id)}`));
  return user ? toAppUser(user) : undefined;
}

export async function getUserByEmail(email: string): Promise<AppUser | undefined> {
  const user = await apiRequest<ApiUser | null>('/users', { query: { email } });
  return user ? toAppUser(user) : undefined;
}

export async function createUser(input: UserInput): Promise<AppUser> {
  const created = await apiRequest<ApiUser>('/users', {
    method: 'POST',
    body: {
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      department: input.department,
      status: input.status,
      phone: input.phone,
      moduleAccess: input.permissions ? toModuleAccess(input.permissions) : undefined
    }
  });
  return toAppUser(created);
}

export type UserPatch = Partial<Omit<UserInput, 'permissions'>> & { permissions?: UserPermissions };

export async function updateUser(id: string, patch: UserPatch): Promise<AppUser> {
  const { permissions, ...rest } = patch;
  const updated = await apiRequest<ApiUser>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...rest, ...(permissions ? { moduleAccess: toModuleAccess(permissions) } : {}) }
  });
  return toAppUser(updated);
}

export async function setUserStatus(id: string, status: UserStatus): Promise<AppUser> {
  return updateUser(id, { status });
}

/**
 * Active users of a given role.
 *
 * Filtered client-side off the full directory rather than asking the API for a
 * role, because the caller that needs it — the approvals screen assigning a
 * stage — needs several roles at once on one screen, and one cached list
 * answers all of them. There is no /users?role= endpoint for that reason.
 */
export function selectUsersByRole(users: AppUser[], role: RoleId): AppUser[] {
  return users.filter((user) => user.role === role && user.status === 'Active');
}
